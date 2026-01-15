import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { User, Mail, Calendar, Shield, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

const Profile = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container max-w-2xl py-8 px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-40 bg-muted rounded-xl" />
            <div className="h-60 bg-muted rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <div className="container max-w-2xl py-8 px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug
        </Button>

        <h1 className="text-3xl font-display font-bold mb-6">Mijn Profiel</h1>

        <div className="space-y-6">
          {/* Account Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Informatie
              </CardTitle>
              <CardDescription>
                Je account gegevens en instellingen
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
                      Lid sinds {formatDistanceToNow(new Date(user.created_at), { addSuffix: true, locale: nl })}
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
                    <span className="text-muted-foreground">E-mail bevestigd</span>
                  </div>
                  <Badge variant={user.email_confirmed_at ? "default" : "secondary"}>
                    {user.email_confirmed_at ? "Ja" : "Nee"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Passkey Manager */}
          <PasskeyManager />
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
