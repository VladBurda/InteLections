import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MY_PRODUCTS } from '../data/my-products';
import type { ProductCourse } from '../types/product';
import ProductCard from '../components/ProductCard';
import AddCourseCard from '../components/AddCourseCard';

export default function MyProductsPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductCourse[]>(MY_PRODUCTS);

  const filtered = useMemo(
    () =>
      products.filter(p =>
        [p.title, p.author, p.status]
          .filter(Boolean)
          .some(t => t!.toLowerCase().includes(query.toLowerCase())),
      ),
    [query, products],
  );

  function toggleStar(id: string) {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, starred: !p.starred } : p)),
    );
  }

  function addCourse() {
    // placeholder: nowy draft
    const id = `new-${Date.now()}`;
    setProducts(prev => [
      ...prev,
      { id, title: 'Untitled Course', author: 'You', status: 'Draft' },
    ]);
    // TODO: nawigacja do Create Course wizard
  }

  return (
    <section className="space-y-4">
      {/* Local search bar (w header masz globalne - to jest kontekstowe) */}
      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 rounded-full border px-3 py-2 min-w-[260px]">
          <Search className="size-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search in My Products"
            className="outline-none bg-transparent w-full"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(p => (
          <ProductCard key={p.id} course={p} onToggleStar={toggleStar} />
        ))}

        {/* Add Course tile at the end */}
        <AddCourseCard onClick={addCourse} />
      </div>
    </section>
  );
}
