import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    password: '',
    confirmPassword: ''
  });

  const token = searchParams.get('token');
  const type = searchParams.get('type');

  useEffect(() => {
    const initFromInvite = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setSessionReady(true);
          return;
        }

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          setSessionReady(true);
          return;
        }

        // If already signed in, mark ready
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSessionReady(true);
          return;
        }

        toast({
          title: "Invalid or expired invitation link",
          description: "Please request a new invite from your administrator.",
          variant: "destructive",
        });
        navigate('/auth');
      } catch (err: any) {
        toast({
          title: "Invitation error",
          description: err.message || "Failed to validate invitation link.",
          variant: "destructive",
        });
        navigate('/auth');
      }
    };

    initFromInvite();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      // Complete the invitation by updating the user's password
      const { error } = await supabase.auth.updateUser({
        password: formData.password,
        data: {
          display_name: formData.fullName,
          role: 'sales_rep'
        }
      });

      if (error) throw error;

      toast({
        title: "Account setup complete!",
        description: "Your account has been created successfully. You can now log in.",
      });

      navigate('/auth');
    } catch (error: any) {
      toast({
        title: "Setup failed",
        description: error.message || "Failed to complete account setup.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Complete Your Account Setup</CardTitle>
          <CardDescription>
            You've been invited to join as a Sales Representative. Complete your account setup to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Choose a password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                required
                minLength={6}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                required
                minLength={6}
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !sessionReady || !formData.fullName || !formData.password || !formData.confirmPassword}
            >
              {loading ? "Setting up account..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}