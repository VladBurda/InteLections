export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'Student' | 'Teacher' | 'Personal';
  avatarUrl?: string;
  bio?: string;
  location?: string;
  birthday?: string; // ISO
};
