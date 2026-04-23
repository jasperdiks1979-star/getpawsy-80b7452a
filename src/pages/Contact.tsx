import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Mail, Clock, Send, MessageSquare, CheckCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { SUPPORT_EMAIL, INFO_EMAIL, RESPONSE_TIME } from '@/lib/shipping-constants';
import { PageChangelog } from '@/components/seo/PageChangelog';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  subject: z.string().min(1, 'Please select a subject'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  orderNumber: z.string().optional(),
});

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    orderNumber: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const subjects = [
    { value: 'order', label: 'Order Question' },
    { value: 'shipping', label: 'Shipping & Delivery' },
    { value: 'return', label: 'Returns & Refunds' },
    { value: 'product', label: 'Product Question' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('contact_messages')
        .insert({
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
          order_number: formData.orderNumber || null,
        });

      if (error) throw error;

      // Send notification email to admin (don't block on this)
      supabase.functions.invoke('notify-contact-message', {
        body: {
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
          orderNumber: formData.orderNumber || undefined,
        },
      }).catch((notifyError) => {
        console.error('Failed to send admin notification:', notifyError);
      });

      setIsSubmitted(true);
      toast.success('Message sent successfully! We will get back to you soon.');
    } catch (error) {
      console.error('Contact form error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: 'Email Us',
      content: SUPPORT_EMAIL,
      description: RESPONSE_TIME,
      href: `mailto:${SUPPORT_EMAIL}`,
    },
    {
      icon: Building2,
      title: 'Location',
      content: 'New York, NY · United States',
      description: 'Online-only pet supply store serving customers across the US',
      href: null,
    },
    {
      icon: Clock,
      title: 'Business Hours',
      content: 'Monday – Friday',
      description: '9:00 AM – 5:00 PM Eastern Time',
      href: null,
    },
  ];

  if (isSubmitted) {
    return (
      <Layout>
        <div className="min-h-screen py-20 lg:py-32">
          <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
               <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
                Message Sent!
               </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Thank you for contacting us. We have received your message and will get back 
                to you within 24 hours.
              </p>
              <Button onClick={() => setIsSubmitted(false)} variant="outline">
                Send Another Message
              </Button>
            </motion.div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Contact Us | GetPawsy</title>
        <meta name="description" content="Contact GetPawsy customer support. Email support@getpawsy.pet for order help, shipping questions, and returns. We respond within 24 hours." /></Helmet>
      <div className="min-h-screen py-16 lg:py-24">
        <div className="container px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
              Contact Us
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-3">
              Have a question or need help? We are here for you and your furry friends. 
              Fill out the form below and we will get back to you as soon as possible.
            </p>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {RESPONSE_TIME}. Our support team is here to help with any questions about your order, shipping, returns, or products. You can also reach us at{' '}
              <a href={`mailto:${INFO_EMAIL}`} className="text-primary hover:underline">{INFO_EMAIL}</a>.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <PageChangelog pageKey="contact" />
          </div>

          <div className="grid lg:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2"
            >
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="name">Your Name *</Label>
                      <Input
                        id="name"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="subject">Subject *</Label>
                      <Select 
                        value={formData.subject} 
                        onValueChange={(value) => setFormData({ ...formData, subject: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.value} value={subject.value}>
                              {subject.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="orderNumber">Order Number (optional)</Label>
                      <Input
                        id="orderNumber"
                        placeholder="e.g., ORD-12345"
                        value={formData.orderNumber}
                        onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us how we can help you..."
                      rows={6}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    size="lg" 
                    className="w-full gap-2"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      'Sending...'
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </motion.div>

            {/* Contact Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-6"
            >
              {contactInfo.map((info) => (
                <div 
                  key={info.title}
                  className="bg-card rounded-xl shadow-card p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <info.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{info.title}</h3>
                      {info.href ? (
                        <a 
                          href={info.href} 
                          className="text-primary hover:underline font-medium"
                        >
                          {info.content}
                        </a>
                      ) : (
                        <p className="font-medium text-foreground">{info.content}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Business Entity Info */}
              <div className="bg-card rounded-xl shadow-card p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Business Information</h3>
                    <div className="space-y-1.5 text-sm">
                      <p className="text-muted-foreground">
                        <span className="text-foreground font-medium">Legal name:</span> GetPawsy LLC
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-foreground font-medium">Trading as:</span> GetPawsy
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-foreground font-medium">Location:</span> New York, NY · United States
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-foreground font-medium">Contact:</span>{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      GetPawsy LLC is fully responsible for all orders, payments, shipping, and customer service.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      GetPawsy is an independent online store focused on quality pet products for dogs and cats.
                    </p>
                  </div>
                </div>
              </div>

              {/* Customer Support Section */}
              <div className="bg-card rounded-xl shadow-card p-6">
                <h3 className="font-semibold text-foreground mb-4 text-lg">Customer Support</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[120px]">Email:</span>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">{SUPPORT_EMAIL}</a>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[120px]">Response Time:</span>
                    <span className="text-foreground font-medium">Usually within 24–48 hours</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[120px]">Business Hours:</span>
                    <span className="text-foreground font-medium">Monday – Friday, 9:00 AM – 5:00 PM Eastern Time</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Our customer support team is always ready to assist you with product questions, shipping information, or returns.
                </p>
              </div>

              {/* Response Time */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
                <h3 className="font-semibold text-foreground mb-2">Response Time</h3>
                <p className="text-sm text-muted-foreground">
                   We typically respond to all inquiries within 24–48 hours. 
                   For urgent matters, please include your order number for faster assistance.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;