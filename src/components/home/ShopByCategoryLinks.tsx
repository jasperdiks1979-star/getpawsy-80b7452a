import { Link } from 'react-router-dom';
import categoryDog from '@/assets/category-dog.jpg';
import categoryCat from '@/assets/category-cat.jpg';

const CATEGORIES = [
  { label: 'Dog Essentials', href: '/dog', image: categoryDog },
  { label: 'Cat Essentials', href: '/cat', image: categoryCat },
  { label: 'Bestsellers', href: '/bestsellers', image: categoryDog },
  { label: 'New Arrivals', href: '/products', image: categoryCat },
] as const;

/**
 * Clean 4-card category grid — simplified for premium feel.
 */
export function ShopByCategoryLinks() {
  return (
    <section className="py-12 md:py-16">
      <div className="container px-4 md:px-6">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center mb-8">
          Shop by Category
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.href}
              to={cat.href}
              className="group relative rounded-2xl overflow-hidden aspect-square"
            >
              <img
                src={cat.image}
                alt={cat.label}
                width={300}
                height={300}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 md:p-4">
                <span className="text-sm md:text-base font-semibold text-white drop-shadow-md">
                  {cat.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ShopByCategoryLinks;
