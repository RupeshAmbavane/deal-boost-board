import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Users, Activity, TrendingUp, XCircle } from 'lucide-react';
import { Customer } from '@/types/customer';
import { getCustomers } from '@/services/customerService';
import { CustomerTable } from './CustomerTable';
import { CSVUpload } from './CSVUpload';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getAllWorkflows, Workflow } from '@/services/workflowService';

export const SalesRepDashboard = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const [customersData, workflowsData] = await Promise.all([
        getCustomers(),
        getAllWorkflows()
      ]);
      setCustomers(customersData);
      setWorkflows(workflowsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Set up real-time subscription for customers
    const customersChannel = supabase
      .channel('my-customers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers'
        },
        () => {
          console.log('Customer data changed, reloading...');
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(customersChannel);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to sign out. Please try again.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Success',
          description: 'You have been signed out successfully.'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive'
      });
    }
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    loadData();
  };

  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const pendingCustomers = customers.filter(c => c.status === 'pending').length;
  const wonCustomers = customers.filter(c => c.status === 'won').length;
  const lostCustomers = customers.filter(c => c.status === 'lost').length;

  const filteredCustomers = statusFilter === 'all' 
    ? customers 
    : customers.filter(c => c.status === statusFilter);

  return (
    <div className="min-h-screen bg-dashboard-bg p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-primary">Sales Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back, {user?.email}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowUpload(!showUpload)}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={loadData} disabled={loading}>
              Refresh Data
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground">
                All customers
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setStatusFilter('active')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCustomers}</div>
              <p className="text-xs text-muted-foreground">
                In workflow
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setStatusFilter('pending')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Activity className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingCustomers}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting process
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setStatusFilter('won')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Won</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{wonCustomers}</div>
              <p className="text-xs text-muted-foreground">
                Converted
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setStatusFilter('lost')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lost</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lostCustomers}</div>
              <p className="text-xs text-muted-foreground">
                Not converted
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CSV Upload */}
        {showUpload && (
          <Card>
            <CardHeader>
              <CardTitle>Import Customers</CardTitle>
              <CardDescription>
                Upload a CSV file to import customer data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CSVUpload onUploadSuccess={handleUploadSuccess} />
            </CardContent>
          </Card>
        )}

        {/* Customers Table with Filters */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Your Customers</CardTitle>
                <CardDescription>
                  Manage and process your assigned customers
                </CardDescription>
              </div>
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="won">Won</TabsTrigger>
                  <TabsTrigger value="lost">Lost</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <CustomerTable 
              data={filteredCustomers} 
              loading={loading}
              onDataChange={loadData}
              workflows={workflows}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};