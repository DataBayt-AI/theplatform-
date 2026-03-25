import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import ModelManagement from "./pages/ModelManagement";
import ProjectSettings from "./pages/ProjectSettings";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import { DirectionProvider } from "@radix-ui/react-direction";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useLanguage } from "@/contexts/LanguageContext";

const queryClient = new QueryClient();

// Bridges the language context into Radix UI's direction system so all
// Radix primitives (Select, Tabs, Dialog, …) render in the correct direction.
const RadixDirectionBridge = ({ children }: { children: React.ReactNode }) => {
  const { isRTL } = useLanguage();
  return <DirectionProvider dir={isRTL ? "rtl" : "ltr"}>{children}</DirectionProvider>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
    <RadixDirectionBridge>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/model-management" element={<ModelManagement />} />
            <Route path="/project/:projectId" element={<Index />} />
            <Route path="/projects/:projectId/settings" element={<ProjectSettings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </RadixDirectionBridge>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
