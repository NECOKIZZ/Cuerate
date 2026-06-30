// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CuerateRoyalty, IERC20} from "../src/CuerateRoyalty.sol";

/// @dev Minimal 6-decimal mock USDC for tests (self-contained; no forge-std needed).
contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/**
 * Dependency-free Foundry test. Each `test_*` function reverts on failure (forge reports pass/fail).
 * GROSS = 1_000_000 (1 USDC).
 *   - Original post: creator keeps 950_000, platform takes the 5% fee = 50_000.
 *   - Forked post: 50% / 25% / 12.5% / ... down the chain; platform absorbs the leftover remainder.
 */
contract CuerateRoyaltyTest {
    uint256 constant GROSS = 1_000_000;
    uint256 constant ORIGINAL_FEE = 50_000; // 5% on originals

    address constant PLATFORM = address(0xBEEF);

    MockUSDC usdc;
    CuerateRoyalty royalty;

    function _setup() internal {
        usdc = new MockUSDC();
        royalty = new CuerateRoyalty(address(usdc), PLATFORM);
        usdc.mint(address(this), GROSS);
        usdc.approve(address(royalty), GROSS);
    }

    function _addr(uint160 i) internal pure returns (address) {
        return address(0x1000 + i);
    }

    function _id(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("post", i));
    }

    function _check(string memory what, uint256 got, uint256 want) internal pure {
        require(got == want, what);
    }

    /// Register a linear chain of `depth` posts, post[0] most-recent (the one being paid).
    /// Returns the leaf postId. Creator of post[i] is _addr(i).
    function _chain(uint8 depth) internal returns (bytes32) {
        bytes32 prevId = bytes32(0);
        // Build from root (oldest) to leaf so parents exist first.
        for (uint8 i = depth; i >= 1; i--) {
            bytes32 id = _id(i);
            royalty.registerPost(id, _addr(i - 1), prevId);
            prevId = id;
            if (i == 1) break; // avoid uint8 underflow
        }
        return _id(1); // leaf = post 1 (most recent)
    }

    function test_originalPost_creatorKeeps95() external {
        _setup();
        // A single original post (no parent): creator keeps 95%, platform takes the 5% fee.
        bytes32 id = _id(1);
        royalty.registerPost(id, _addr(0), bytes32(0));
        royalty.settle(id, GROSS);
        _check("creator 95%", usdc.balanceOf(_addr(0)), GROSS - ORIGINAL_FEE);
        _check("platform 5%", usdc.balanceOf(PLATFORM), ORIGINAL_FEE);
    }

    function test_fork_depth2() external {
        _setup();
        bytes32 leaf = _chain(2);
        royalty.settle(leaf, GROSS);
        _check("leaf 50%", usdc.balanceOf(_addr(0)), 500_000);
        _check("original 25%", usdc.balanceOf(_addr(1)), 250_000);
        _check("platform remainder", usdc.balanceOf(PLATFORM), 250_000);
    }

    function test_fork_depth3() external {
        _setup();
        bytes32 leaf = _chain(3);
        royalty.settle(leaf, GROSS);
        _check("leaf 50%", usdc.balanceOf(_addr(0)), 500_000);
        _check("parent 25%", usdc.balanceOf(_addr(1)), 250_000);
        _check("original 12.5%", usdc.balanceOf(_addr(2)), 125_000);
        _check("platform remainder", usdc.balanceOf(PLATFORM), 125_000);
    }

    function test_fork_depth5() external {
        _setup();
        bytes32 leaf = _chain(5);
        royalty.settle(leaf, GROSS);
        _check("gen1", usdc.balanceOf(_addr(0)), 500_000);
        _check("gen2", usdc.balanceOf(_addr(1)), 250_000);
        _check("gen3", usdc.balanceOf(_addr(2)), 125_000);
        _check("gen4", usdc.balanceOf(_addr(3)), 62_500);
        _check("gen5(original)", usdc.balanceOf(_addr(4)), 31_250);
        _check("platform remainder", usdc.balanceOf(PLATFORM), 31_250);
    }

    function test_fork_depth7_noCap() external {
        _setup();
        bytes32 leaf = _chain(7);
        royalty.settle(leaf, GROSS);
        // No 5-generation cap anymore — all 7 generations are paid (dust floor not reached).
        _check("gen1", usdc.balanceOf(_addr(0)), 500_000);
        _check("gen5", usdc.balanceOf(_addr(4)), 31_250);
        _check("gen6 paid", usdc.balanceOf(_addr(5)), 15_625);
        _check("gen7(original) paid", usdc.balanceOf(_addr(6)), 7_812); // floor(1e6/128)
        _check("platform remainder", usdc.balanceOf(PLATFORM), 7_813);
    }

    function test_zeroAddressCreatorFoldsToPlatform() external {
        _setup();
        // Forked post whose original (gen2) creator is address(0) → its 250_000 slice folds to platform.
        bytes32 root = _id(2);
        royalty.registerPost(root, address(0), bytes32(0));
        bytes32 leaf = _id(1);
        royalty.registerPost(leaf, _addr(0), root);
        royalty.settle(leaf, GROSS);
        _check("leaf 50%", usdc.balanceOf(_addr(0)), 500_000);
        _check("platform(folded gen2 + remainder)", usdc.balanceOf(PLATFORM), 500_000);
    }

    function test_conservation() external {
        _setup();
        bytes32 leaf = _chain(7);
        royalty.settle(leaf, GROSS);
        uint256 total = usdc.balanceOf(PLATFORM);
        for (uint160 i = 0; i < 7; i++) {
            total += usdc.balanceOf(_addr(i));
        }
        _check("sum == gross", total, GROSS);
        _check("contract drained", usdc.balanceOf(address(royalty)), 0);
    }
}
