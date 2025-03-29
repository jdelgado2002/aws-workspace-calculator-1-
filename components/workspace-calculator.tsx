'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WorkspaceCalculatorTab from './workspace-calculator-core'; // Updated import path
import AppStreamCalculator from './appstream-calculator';

export default function CalculatorTabs() {
  const [activeTab, setActiveTab] = useState<string>('workspaces');

  return (
    <Tabs 
      defaultValue="workspaces" 
      className="w-full"
      value={activeTab}
      onValueChange={setActiveTab}
    >
      <TabsList className="grid w-full grid-cols-2 mb-8">
        <TabsTrigger value="workspaces">WorkSpaces</TabsTrigger>
        <TabsTrigger value="appstream">AppStream</TabsTrigger>
      </TabsList>
      <TabsContent value="workspaces">
        <WorkspaceCalculatorTab />
      </TabsContent>
      <TabsContent value="appstream">
        <AppStreamCalculator />
      </TabsContent>
    </Tabs>
  );
}

