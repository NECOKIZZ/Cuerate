// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal ERC-20 surface needed for USDC on Arc (6 decimals).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title CuerateRoyalty
 * @notice On-chain fork registry + decaying royalty splitter for Cuerate ("Pinterest for Agents").
 *
 * A post's fork lineage lives on-chain as parent pointers. When an agent pays to discover a post,
 * `settle` walks that lineage on-chain and splits the payment geometrically — 50% to the post,
 * 25% to its parent, 12.5% to the grandparent, ... — capped at DEPTH_CAP generations, with the
 * last paid slot (or the root, for shorter chains) absorbing the remainder so the parts always
 * sum to exactly the net amount. The platform takes a fixed fee off the top first.
 *
 * USDC on Arc is a 6-decimal ERC-20; all amounts here are in base units (1 USDC = 1_000_000).
 */
contract CuerateRoyalty {
    /// @notice Stop halving once the next slice would fall below this (10 = $0.00001, 6 decimals).
    uint256 public constant DUST = 10;
    /// @notice Fixed platform fee applied ONLY to original posts (500 bps = 5%).
    uint16 public constant ORIGINAL_FEE_BPS = 500;
    /// @notice Gas/loop safety backstop; dust terminates first in practice.
    uint8 public constant MAX_DEPTH = 32;
    uint16 private constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable usdc;
    address public immutable platform;
    address public owner;

    struct Post {
        address creator;
        bytes32 parent;
        bool exists;
    }

    /// @notice postId (keccak256 of the off-chain prompt id) => fork lineage node.
    mapping(bytes32 => Post) public posts;

    event PostRegistered(bytes32 indexed postId, address creator, bytes32 parent);
    event Payout(bytes32 indexed postId, address indexed to, uint8 generation, uint256 amount);
    event Settled(bytes32 indexed postId, address indexed payer, uint256 amount, uint256 platformCut);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error PostAlreadyExists();
    error UnknownPost();
    error ZeroAmount();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _usdc, address _platform) {
        require(_usdc != address(0) && _platform != address(0), "zero addr");
        usdc = IERC20(_usdc);
        platform = _platform;
        // Owner (the registrar that may call registerPost) is set to _platform rather than
        // msg.sender: when deployed via Circle's Smart Contract Platform, msg.sender is Circle's
        // managed deployer EOA, not our wallet. _platform is the registrar/treasury wallet that
        // actually submits registerPost, so it must hold the owner role. setOwner can reassign later.
        owner = _platform;
    }

    /// @notice Hand the registrar role to another address (e.g. a Circle dev-controlled wallet).
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero addr");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Register a post and its parent. `parent == 0x0` marks an original (root) post.
    function registerPost(bytes32 postId, address creator, bytes32 parent) external onlyOwner {
        if (posts[postId].exists) revert PostAlreadyExists();
        posts[postId] = Post({creator: creator, parent: parent, exists: true});
        emit PostRegistered(postId, creator, parent);
    }

    /// @notice Register many posts in one call (handy for backfilling a demo chain).
    function registerPosts(
        bytes32[] calldata postIds,
        address[] calldata creators,
        bytes32[] calldata parents
    ) external onlyOwner {
        require(postIds.length == creators.length && postIds.length == parents.length, "length mismatch");
        for (uint256 i = 0; i < postIds.length; i++) {
            if (posts[postIds[i]].exists) continue; // idempotent
            posts[postIds[i]] = Post({creator: creators[i], parent: parents[i], exists: true});
            emit PostRegistered(postIds[i], creators[i], parents[i]);
        }
    }

    /**
     * @notice Pay `amount` USDC for `postId` and split it across the fork lineage.
     * @dev Caller must have `approve`d this contract for `amount` first.
     *
     * - Original post (no parent): creator keeps all but a fixed 5% fee.
     * - Forked post: halve down the lineage (50% / 25% / 12.5% / ...), stopping at the original
     *   creator or once the next slice falls below DUST. The platform absorbs the leftover remainder.
     *   `address(0)` (unregistered) creators fold their slice into the platform cut.
     */
    function settle(bytes32 postId, uint256 amount) external {
        Post memory leaf = posts[postId];
        if (!leaf.exists) revert UnknownPost();
        if (amount == 0) revert ZeroAmount();

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        uint256 platformCut;

        if (leaf.parent == bytes32(0)) {
            // Original post: protect the creator, take only a small fixed fee.
            uint256 fee = (amount * ORIGINAL_FEE_BPS) / BPS_DENOMINATOR;
            platformCut = fee;
            uint256 toCreator = amount - fee;
            if (leaf.creator == address(0)) {
                platformCut += toCreator;
            } else {
                if (!usdc.transfer(leaf.creator, toCreator)) revert TransferFailed();
                emit Payout(postId, leaf.creator, 1, toCreator);
            }
        } else {
            // Forked post: geometric decay up the chain; platform absorbs the remainder.
            uint256 allocated = 0;
            bytes32 cursor = postId;
            for (uint8 gen = 1; gen <= MAX_DEPTH; gen++) {
                Post memory p = posts[cursor];
                if (!p.exists) break;
                uint256 share = amount >> gen; // amount / 2^gen
                if (share < DUST) break;
                allocated += share;
                if (p.creator == address(0)) {
                    platformCut += share; // unregistered creator → fold into platform
                } else {
                    if (!usdc.transfer(p.creator, share)) revert TransferFailed();
                    emit Payout(postId, p.creator, gen, share);
                }
                if (p.parent == bytes32(0)) break; // reached the original creator
                cursor = p.parent;
            }
            platformCut += amount - allocated; // leftover tail → platform
        }

        if (platformCut > 0) {
            if (!usdc.transfer(platform, platformCut)) revert TransferFailed();
        }

        emit Settled(postId, msg.sender, amount, platformCut);
    }

    /// @notice Convenience view: the ordered ancestor creators of `postId` (most-recent-first).
    function lineageOf(bytes32 postId) external view returns (address[] memory creators) {
        address[MAX_DEPTH] memory tmp;
        uint8 n = 0;
        bytes32 cursor = postId;
        for (uint8 i = 0; i < MAX_DEPTH; i++) {
            Post memory p = posts[cursor];
            if (!p.exists) break;
            tmp[n] = p.creator;
            n++;
            if (p.parent == bytes32(0)) break;
            cursor = p.parent;
        }
        creators = new address[](n);
        for (uint8 i = 0; i < n; i++) {
            creators[i] = tmp[i];
        }
    }
}
