import type { ComponentType } from 'react';
import type { AppUser } from '../types';

// Runtime Overview.jsx does not need the user object directly, but App supplies
// it consistently with other role-aware pages. This declaration keeps the JS
// implementation type-safe from the TypeScript app shell without duplicating
// runtime logic.
declare const Overview: ComponentType<{ user: AppUser }>;

export default Overview;
