import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Heart, Shield, Truck, Award, Users, Leaf, PawPrint, Star, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import logoIcon from '@/assets/logo-getpawsy.png';

const About = () => {
  const values = [
    {
      icon: Heart,
      title: 'Pet-First Philosophy',
      description: 'Every product we curate is evaluated with your pet\'s health, safety, and happiness as the top priority.',
    },
    {
      icon: Shield,
      title: 'Quality Guaranteed',
      description: 'We carefully vet all our suppliers and products to ensure only the best reaches your doorstep.',
    },
    {
      icon: Truck,
      title: 'Worldwide Shipping',
      description: 'We partner with trusted carriers to deliver your orders quickly and safely worldwide.',
    },
    {
      icon: Leaf,
      title: 'Sustainability Matters',
      description: 'We prioritize eco-friendly products and packaging to minimize our environmental pawprint.',
    },
  ];

  const stats = [
    { number: '50K+', label: 'Happy Pets' },
    { number: '10K+', label: 'Products Shipped' },
    { number: '4.9', label: 'Average Rating' },
    { number: '24/7', label: 'Customer Support' },
  ];


  return (
    <Layout>
      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM5QzkyQUMiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          
          <div className="container px-4 md:px-6 relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-4xl mx-auto text-center"
            >
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
                <PawPrint className="w-4 h-4" />
                <span className="text-sm font-medium">Our Story</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground mb-6">
                Making Tails Wag
                <span className="block text-primary">Since 2024</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                GetPawsy was born from a simple belief: every pet deserves the best. 
                We're on a mission to bring joy to pets and their families through 
                carefully curated, high-quality products.
              </p>

              <div className="flex items-center justify-center">
                <img 
                  src={logoIcon} 
                  alt="GetPawsy Logo" 
                  className="w-24 h-24 rounded-3xl shadow-lg"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 bg-foreground text-background">
          <div className="container px-4 md:px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="text-4xl md:text-5xl font-display font-bold text-primary mb-2">
                    {stat.number}
                  </div>
                  <div className="text-background/70">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="py-20 lg:py-28">
          <div className="container px-4 md:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
                  Our Mission
                </h2>
                <p className="text-muted-foreground text-lg mb-6">
                  At GetPawsy, we believe that pets are family. That's why we've dedicated 
                  ourselves to sourcing and delivering products that enhance the lives of 
                  pets and bring peace of mind to pet parents.
                </p>
                <p className="text-muted-foreground text-lg mb-8">
                  From premium nutrition to engaging toys and comfortable accessories, 
                  every item in our catalog is selected with care and tested for quality. 
                  We partner only with suppliers who share our commitment to excellence.
                </p>
                
                <div className="space-y-4">
                  {[
                    'Carefully vetted products from trusted suppliers',
                    'Fast worldwide shipping',
                    'Dedicated customer support team',
                    'Hassle-free returns and exchanges',
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 flex items-center justify-center">
                  <div className="text-center p-8">
                    <PawPrint className="w-24 h-24 text-primary mx-auto mb-6" />
                    <p className="text-2xl font-display font-bold text-foreground">
                      "Pets bring us joy. We bring them the best."
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-20 lg:py-28 bg-muted/30">
          <div className="container px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
                Our Values
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                These principles guide everything we do at GetPawsy.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {values.map((value, index) => (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-background rounded-2xl p-6 shadow-soft hover:shadow-lg transition-shadow"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <value.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                    {value.title}
                  </h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>


        {/* CTA Section */}
        <section className="py-20 lg:py-28 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
          <div className="container px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto text-center"
            >
              <Award className="w-16 h-16 text-primary mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
                Join the GetPawsy Family
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Discover why thousands of pet parents trust us for their furry family members.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="btn-organic">
                  <Link to="/products">Shop Now</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/contact">Contact Us</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default About;
