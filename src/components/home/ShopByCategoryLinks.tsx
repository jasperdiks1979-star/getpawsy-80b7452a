import { Link } from 'react-router-dom';
import categoryDogs from '@/assets/category-dogs.jpg';
import categoryCats from '@/assets/category-cats.jpg';
import categoryBestsellers from '@/assets/category-bestsellers.jpg';
import categoryNew from '@/assets/category-new.jpg';

const CATEGORIES = [
  { label: 'For Happy, Active Dogs', href: '/dog', image: categoryDogs },
  { label: 'Comfort & Play for Cats', href: '/cat', image: categoryCats },
  { label: 'Most Loved Products', href: '/bestsellers', image: categoryBestsellers },
  { label: 'Just Arrived', href: '/products', image: categoryNew },
] as const;

export function ShopByCategoryLinks() {
  return (
    <section className="py-12 md:py-16">
      <div className="container px-4 md:px-6">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center mb-2">
          Shop by Category
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-lg mx-auto">
          Browse our curated collections for dogs and cats — from cozy beds and durable toys to smart litter solutions and travel gear.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.href}
              to={cat.href}
              className="group relative rounded-2xl overflow-hidden aspect-square shadow-sm hover:shadow-lg transition-shadow duration-300"
            >
              <img
                src={cat.image}
                alt={cat.label}
                width={640}
                height={640}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 md:p-4">
                <span className="text-sm md:text-base font-semibold text-white drop-shadow-lg">
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
