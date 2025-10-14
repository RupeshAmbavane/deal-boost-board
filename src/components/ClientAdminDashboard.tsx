import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users, UserCheck, Activity, TrendingUp } from 'lucide-react';
import { SalesRep } from '@/types/salesRep';
import { Customer } from '@/types/customer';
import { getSalesReps } from '@/services/salesRepService';
import { getCustomers } from '@/services/customerService';
import { SalesRepTable } from './SalesRepTable';
import { InviteSalesRepDialog } from './InviteSalesRepDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AuditLogViewer from './AuditLogViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const ClientAdminDashboard = () => {
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const [repsData, customersData] = await Promise.all([
        getSalesReps(),
        getCustomers()
      ]);
      setSalesReps(repsData);
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Set up real-time subscriptions for sales_reps and customers
    const salesRepsChannel = supabase
      .channel('sales-reps-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_reps'
        },
        () => {
          console.log('Sales reps data changed, reloading...');
          loadData();
        }
      )
      .subscribe();

    const customersChannel = supabase
      .channel('customers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers'
        },
        () => {
          console.log('Customers data changed, reloading...');
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesRepsChannel);
      supabase.removeChannel(customersChannel);
    };
  }, []);

  const handleInviteSuccess = () => {
    setShowInviteDialog(false);
    loadData();
    toast({
      title: 'Success',
      description: 'Sales representative invited successfully',
    });
  };

  const activeSalesReps = salesReps.filter(rep => rep.status === 'active').length;
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const pendingCustomers = customers.filter(c => c.status === 'pending').length;
  const wonCustomers = customers.filter(c => c.status === 'won').length;

  return (
    <div className="min-h-screen bg-dashboard-bg p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-primary">Client Dashboard</h1>
            <p className="text-muted-foreground">Manage your sales team and monitor performance</p>
          </div>
          <Button onClick={() => setShowInviteDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Invite Sales Rep
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales Reps</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{salesReps.length}</div>
              <p className="text-xs text-muted-foreground">
                {activeSalesReps} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCustomers}</div>
              <p className="text-xs text-muted-foreground">
                All customers
              </p>
            </CardContent>
          </Card>

          <Card>
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

          <Card>
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

          <Card>
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
        </div>

        {/* Sales Reps & Audit Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Management</CardTitle>
            <CardDescription>
              Manage your sales team and monitor system activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="reps" className="w-full">
              <TabsList>
                <TabsTrigger value="reps">Sales Reps</TabsTrigger>
                <TabsTrigger value="audit">Audit Log</TabsTrigger>
              </TabsList>
              
              <TabsContent value="reps" className="mt-6">
                <SalesRepTable 
                  data={salesReps} 
                  loading={loading}
                  onDataChange={loadData}
                />
              </TabsContent>
              
              <TabsContent value="audit" className="mt-6">
                <AuditLogViewer />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Invite Dialog */}
        <InviteSalesRepDialog
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
          onSuccess={handleInviteSuccess}
        />
      </div>
    </div>
  );
};