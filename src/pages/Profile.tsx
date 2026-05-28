import { useEffect, memo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { User, Mail, Calendar, Shield, ArrowLeft, Package, ChevronRight, RotateCcw, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { getConversionFlag } from '@/lib/conversionFlags';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Profile page skeleton component
const ProfileSkeleton = memo(() => (
  <div className="container max-w-2xl py-8 px-4">
    {/* Back button */}
    <Skeleton className="h-9 w-20 mb-6" />
    
    {/* Title */}
    <Skeleton className="h-9 w-36 mb-6" />

    <div className="space-y-6">
      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-44" />
          </div>
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-36" />
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Link Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
            <Skeleton className="h-5 w-5 rounded" />
          </div>
        </CardContent>
      </Card>

      {/* Passkey Manager Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-36 rounded-md" />
        </CardContent>
      </Card>

      {/* Reset App Data Card */}
      <Card className="border-destructive/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-40 rounded-md" />
        </CardContent>
      </Card>

      {/* Sign Out Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-4 w-40 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-28 rounded-md" />
        </CardContent>
      </Card>
    </div>
  </div>
));
ProfileSkeleton.displayName = 'ProfileSkeleton';

const Profile = () => {
  const { user, isAdmin, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const premiumProfile = getConversionFlag('premiumProfile');

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    toast.success(premiumProfile ? "You've been signed out" : 'Je bent uitgelogd');
  };

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <Layout>
        <ProfileSkeleton />
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="container max-w-2xl py-8 px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        {premiumProfile ? (
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
              Account
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              My Profile
            </h1>
          </div>
        ) : (
          <h1 className="text-3xl font-display font-bold mb-6">My Profile</h1>
        )}

        <div className="space-y-6">
          {/* Account Info Card */}
          <Card className={premiumProfile ? 'border-border/60 shadow-none' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Information
              </CardTitle>
              <CardDescription>
                Your account details and settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{user.email}</p>
                    {isAdmin && (
                      <Badge variant="secondary" className="gap-1">
                        <Shield className="w-3 h-3" />
                        Admin
                      </Badge>
                    )}
                  </div>
                  {user.created_at && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Member since {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">E-mail</span>
                  </div>
                  <span className="text-sm font-medium">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Email confirmed</span>
                  </div>
                  <Badge variant={user.email_confirmed_at ? "default" : "secondary"}>
                    {user.email_confirmed_at ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Link */}
          <Card className={premiumProfile ? 'border-border/60 shadow-none hover:bg-muted/30 transition-colors' : 'hover:shadow-md transition-shadow'}>
            <Link to="/orders">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">My Orders</p>
                      <p className="text-sm text-muted-foreground">View your order history</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Link>
          </Card>

          {/* Passkey Manager */}
          <PasskeyManager />

          {/* Reset App Data */}
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <RotateCcw className="w-5 h-5" />
                Reset App Data
              </CardTitle>
              <CardDescription>
                Clear your local data if you're experiencing issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reset Local Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset App Data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear your shopping cart, wishlist, and recently viewed products. 
                      This can help fix display issues but cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        localStorage.clear();
                        toast.success('App data cleared! Refreshing...');
                        setTimeout(() => window.location.reload(), 1000);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Reset Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Sign Out */}
          <Card className={premiumProfile ? 'border-border/60 shadow-none' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogOut className="w-5 h-5" />
                {premiumProfile ? 'Sign out' : 'Uitloggen'}
              </CardTitle>
              <CardDescription>
                {premiumProfile ? 'Sign out of your account' : 'Log uit van je account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={handleSignOut} className="gap-2">
                <LogOut className="w-4 h-4" />
                {premiumProfile ? 'Sign out' : 'Uitloggen'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
