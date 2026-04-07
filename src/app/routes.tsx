import { createBrowserRouter } from 'react-router';
import { Feed } from './screens/Feed';
import { Post } from './screens/Post';
import { Explore } from './screens/Explore';
import { Saves } from './screens/Saves';
import { MyProfile } from './screens/MyProfile';
import { UserProfile } from './screens/UserProfile';
import { Notifications } from './screens/Notifications';
import { Onboarding } from './screens/Onboarding';
import { Layout } from './components/Layout';
import { Auth } from './screens/Auth';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Feed },
      { path: 'post', Component: Post },
      { path: 'explore', Component: Explore },
      { path: 'saves', Component: Saves },
      { path: 'profile', Component: MyProfile },
      { path: 'user/:handle', Component: UserProfile },
      { path: 'notifications', Component: Notifications },
    ],
  },
  {
    path: '/onboarding',
    Component: Onboarding,
  },
  {
    path: '/auth',
    Component: Auth,
  },
]);
