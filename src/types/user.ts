export type UserRole = 'Student' | 'Teacher' | 'Personal' | 'Admin';
export type SubscriptionPlan = 'free' | 'plus';
export type ConnectedAccountStatus = 'not_connected' | 'pending' | 'ready';

export type UserAchievement = {
  id: string;
  title: string;
  organization?: string;
  yearLabel?: string;
};

export type UserCertificate = {
  id: string;
  title: string;
  issuer?: string;
  yearLabel?: string;
  credentialUrl?: string;
};

export type UserActivity = {
  id: string;
  title: string;
  organization?: string;
  description?: string;
  yearLabel?: string;
};

export type UserSocialLink = {
  id: string;
  platform: string;
  url: string;
};

export type UserProfileCourse = {
  id: string;
  title: string;
  category: string;
  level: string;
  status: string;
};

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartedAt?: string | null;
  billingManaged?: boolean;
  sellerStripeConnected?: boolean;
  sellerStripeAccountId?: string | null;
  sellerBillingReady?: boolean;
  connectedAccountStatus?: ConnectedAccountStatus;
  canSellPaidCourses?: boolean;
  profileBlocked?: boolean;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  birthday?: string;
  headline?: string;
  website?: string;
  institution?: string;
  specialization?: string;
  achievements?: UserAchievement[];
  certificates?: UserCertificate[];
  activities?: UserActivity[];
  socialLinks?: UserSocialLink[];
  featuredCourses?: UserProfileCourse[];
};


