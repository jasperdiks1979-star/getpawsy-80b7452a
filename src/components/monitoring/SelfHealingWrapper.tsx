 import React, { Component, ReactNode, useEffect, useState } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import type { Json } from '@/integrations/supabase/types';
 
 interface SelfHealingWrapperProps {
   children: ReactNode;
   componentName: string;
   fallback: ReactNode;
   triggerCondition?: () => boolean;
   permanentFixSuggestion?: string;
 }
 
 interface SelfHealingWrapperState {
   hasError: boolean;
   fallbackActive: boolean;
 }
 
 /**
  * Self-Healing UI Wrapper Component
  * 
  * Wraps components to provide automatic fallback when errors occur.
  * All fallback activations are logged for debugging and permanent fixes.
  * 
  * Rules:
  * - Never modifies database values
  * - Never touches pricing or payments
  * - All actions are reversible and logged
  */
 export class SelfHealingWrapper extends Component<SelfHealingWrapperProps, SelfHealingWrapperState> {
   constructor(props: SelfHealingWrapperProps) {
     super(props);
     this.state = {
       hasError: false,
       fallbackActive: false,
     };
   }
 
   static getDerivedStateFromError(): SelfHealingWrapperState {
     return { hasError: true, fallbackActive: true };
   }
 
   componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
     this.logSelfHealing(
       `Component error: ${error.message}`,
       'Activated fallback UI',
       { error: error.message, stack: errorInfo.componentStack }
     );
   }
 
   componentDidUpdate(prevProps: SelfHealingWrapperProps): void {
     // Check trigger condition if provided
     if (this.props.triggerCondition && !this.state.fallbackActive) {
       try {
         if (this.props.triggerCondition()) {
           this.setState({ fallbackActive: true });
           this.logSelfHealing(
             'Trigger condition met',
             'Activated fallback UI',
             { condition: 'Custom trigger condition returned true' }
           );
         }
       } catch (e) {
         // Trigger check failed, activate fallback
         this.setState({ fallbackActive: true, hasError: true });
       }
     }
   }
 
 private async logSelfHealing(
     triggerReason: string,
     actionTaken: string,
     originalState: Record<string, unknown>
   ): Promise<void> {
     try {
       const insertData = {
         component_name: this.props.componentName,
         trigger_reason: triggerReason,
         action_taken: actionTaken,
         original_state: originalState as Json,
         fallback_state: { fallbackActive: true } as Json,
         affected_url: typeof window !== 'undefined' ? window.location.href : null,
         permanent_fix_suggestion: this.props.permanentFixSuggestion || 
           `Review ${this.props.componentName} for the triggering condition`,
       };
       await supabase.from('monitoring_self_healing_logs').insert(insertData);
     } catch (e) {
       console.error('[SelfHealing] Failed to log:', e);
     }
   }
 
   render(): ReactNode {
     if (this.state.hasError || this.state.fallbackActive) {
       return this.props.fallback;
     }
     return this.props.children;
   }
 }
 
 /**
  * Hook version for functional components
  */
 export function useSelfHealing(
   componentName: string,
   shouldFallback: boolean,
   permanentFixSuggestion?: string
 ): { isInFallbackMode: boolean } {
   const [logged, setLogged] = useState(false);
 
   useEffect(() => {
     if (shouldFallback && !logged) {
       setLogged(true);
       
       // Log to database
       const logFallback = async () => {
         try {
           const insertData = {
             component_name: componentName,
             trigger_reason: 'Fallback condition detected',
             action_taken: 'Activated fallback UI',
             original_state: { shouldFallback } as Json,
             fallback_state: { fallbackActive: true } as Json,
             affected_url: typeof window !== 'undefined' ? window.location.href : null,
             permanent_fix_suggestion: permanentFixSuggestion || `Review ${componentName}`,
           };
           await supabase.from('monitoring_self_healing_logs').insert(insertData);
           console.info(`[SelfHealing] ${componentName}: Fallback activated and logged`);
         } catch (e) {
           console.error('[SelfHealing] Failed to log:', e);
         }
       };
       logFallback();
     }
   }, [shouldFallback, componentName, permanentFixSuggestion, logged]);
 
   return { isInFallbackMode: shouldFallback };
 }
 
 export default SelfHealingWrapper;