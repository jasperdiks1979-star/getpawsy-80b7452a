import { Link } from 'react-router-dom';
import categoryDogs from '@/assets/category-dogs.jpg';
import categoryCats from '@/assets/category-cats.jpg';
import categoryBestsellers from '@/assets/category-bestsellers.jpg';
import categoryNew from '@/assets/category-new.jpg';

const CATEGORIES = [
  { label: 'Dog Essentials', href: '/collections/dogs', image: categoryDogs },
  { label: 'Cat Essentials', href: '/collections/cats', image: categoryCats },
  { label: 'Top Picks', href: '/bestsellers', image: categoryBestsellers },
  { label: 'New Arrivals', href: '/products', image: categoryNew },
] as const;

export function ShopByCategoryLinks() {
  return (
    <section className="py-8 md:py-12">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-5">
          Shop by Pet Type
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.href}
              to={cat.href}
              className="group relative rounded-2xl overflow-hidden aspect-square shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
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
                <span className="text-sm md:text-base font-bold text-white drop-shadow-lg">
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
