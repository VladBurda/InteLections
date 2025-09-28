export type ProductStatus = 'Published' | 'Draft';

export type ProductCourse = {
  id: string;
  title: string;
  author: string;
  status: ProductStatus;
  thumbnailUrl?: string;
  starred?: boolean;
};
