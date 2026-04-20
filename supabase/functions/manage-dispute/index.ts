import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DisputeRequest {
  action: 'create' | 'update_status' | 'add_message' | 'resolve' | 'send_notification';
  disputeId?: string;
  orderId?: string;
  customerEmail?: string;
  disputeType?: string;
  description?: string;
  evidence?: string[];
  status?: string;
  message?: string;
  isInternal?: boolean;
  resolutionType?: string;
  resolutionAmount?: number;
  resolutionNotes?: string;
  senderType?: 'customer' | 'admin';
  attachments?: string[];
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  damaged: 'Damaged Product',
  not_received: 'Order Not Received',
  wrong_item: 'Wrong Item Received',
  quality_issue: 'Quality Issue',
  other: 'Other Issue',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Received',
  in_progress: 'In Progress',
  under_review: 'Under Review',
  awaiting_evidence: 'Awaiting Additional Information',
  processing_with_supplier: 'Being Processed',
  resolved: 'Resolved',
  resolved_refund: 'Resolved - Refund Issued',
  resolved_replacement: 'Resolved - Replacement Sent',
  resolved_partial_refund: 'Resolved - Partial Refund',
  denied: 'Claim Denied',
};

const STATUS_EMAIL_CONFIG: Record<string, { subject: string; color: string; icon: string; message: string }> = {
  pending: {
    subject: 'We\'ve Received Your Claim',
    color: '#FFA000',
    icon: '📬',
    message: 'Your claim has been received and is waiting to be reviewed by our team.',
  },
  in_progress: {
    subject: 'Your Claim Is Being Reviewed',
    color: '#1976D2',
    icon: '🔍',
    message: 'Great news! Our team is actively reviewing your claim. We\'ll get back to you as soon as possible.',
  },
  under_review: {
    subject: 'Your Claim Is Under Review',
    color: '#7B1FA2',
    icon: '📋',
    message: 'Our team is carefully reviewing all the details of your claim.',
  },
  awaiting_evidence: {
    subject: 'Additional Information Needed',
    color: '#F57C00',
    icon: '📎',
    message: 'We need some additional information to process your claim. Please reply to this email with the requested details.',
  },
  processing_with_supplier: {
    subject: 'Your Claim Is Being Processed',
    color: '#00796B',
    icon: '⚙️',
    message: 'We\'re working with our supplier to resolve your issue. This may take a few extra days.',
  },
  resolved: {
    subject: 'Your Claim Has Been Resolved',
    color: '#388E3C',
    icon: '✅',
    message: 'Great news! Your claim has been successfully resolved.',
  },
  denied: {
    subject: 'Update on Your Claim',
    color: '#D32F2F',
    icon: '❌',
    message: 'After careful review, we were unable to approve your claim.',
  },
};

// Send email notification to customer
async function sendDisputeEmail(
  email: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GetPawsy Support <support@getpawsy.pet>',
        to: [email],
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to send email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// Generate dispute confirmation email
function generateDisputeConfirmationEmail(disputeId: string, disputeType: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6B4E3D; margin: 0; font-size: 28px;">🐾 GetPawsy</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">We've Received Your Claim</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Thank you for reaching out to us. We understand how important it is to resolve issues quickly, 
            and we're here to help!
          </p>
          
          <div style="background: #FFF8F0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; color: #6B4E3D;"><strong>Claim Reference:</strong> ${disputeId.slice(0, 8).toUpperCase()}</p>
            <p style="margin: 0; color: #6B4E3D;"><strong>Issue Type:</strong> ${DISPUTE_TYPE_LABELS[disputeType] || disputeType}</p>
          </div>
          
          <h3 style="color: #333; margin-bottom: 15px;">What Happens Next?</h3>
          
          <ol style="color: #666; line-height: 1.8; padding-left: 20px;">
            <li>Our team will review your claim within 24-48 hours</li>
            <li>We may reach out if we need additional information</li>
            <li>You'll receive updates via email as we process your claim</li>
            <li>Most claims are resolved within 3-5 business days</li>
          </ol>
          
          <p style="color: #666; line-height: 1.6; margin-top: 20px;">
            If you have any questions, simply reply to this email or contact us at 
            <a href="mailto:support@getpawsy.pet" style="color: #6B4E3D;">support@getpawsy.pet</a>
          </p>
          
          <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              GetPawsy - Premium Pet Products<br>
              Making pets happy, one product at a time 🐕🐈
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate status update email with specific styling per status
function generateStatusUpdateEmail(disputeId: string, newStatus: string, message?: string): string {
  const statusLabel = STATUS_LABELS[newStatus] || newStatus;
  const config = STATUS_EMAIL_CONFIG[newStatus] || STATUS_EMAIL_CONFIG.in_progress;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6B4E3D; margin: 0; font-size: 28px;">🐾 GetPawsy</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">${config.icon} ${config.subject}</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Hi there! We have an update on your claim.
          </p>
          
          <div style="background: #F8F9FA; border-left: 4px solid ${config.color}; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Claim Reference</p>
            <p style="margin: 0 0 15px 0; color: #333; font-weight: bold; font-size: 18px; font-family: monospace;">
              #${disputeId.slice(0, 8).toUpperCase()}
            </p>
            <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">Current Status</p>
            <p style="margin: 0; color: ${config.color}; font-weight: bold; font-size: 18px;">
              ${statusLabel}
            </p>
          </div>
          
          <div style="background: #FFF8F0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0; color: #6B4E3D; line-height: 1.6;">
              ${config.message}
            </p>
          </div>
          
          ${message ? `
            <div style="background: #E3F2FD; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; color: #1565C0; font-weight: bold; font-size: 14px;">
                💬 Message from our team:
              </p>
              <p style="margin: 0; color: #333; line-height: 1.6;">${message}</p>
            </div>
          ` : ''}
          
          <p style="color: #666; line-height: 1.6;">
            If you have any questions, simply reply to this email or visit our 
            <a href="https://getpawsy.pet/my-claims" style="color: #6B4E3D; font-weight: bold;">claims page</a> 
            to view your claim details.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://getpawsy.pet/my-claims" 
               style="display: inline-block; background: #6B4E3D; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              View My Claims
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              GetPawsy - Premium Pet Products<br>
              Making pets happy, one product at a time 🐕🐈
            </p>
            <p style="color: #bbb; font-size: 12px; margin-top: 10px;">
              GetPawsy is operated by Skidzo • The Netherlands • Serving customers in the United States
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate resolution email
function generateResolutionEmail(
  disputeId: string,
  resolutionType: string,
  resolutionAmount?: number,
  resolutionNotes?: string
): string {
  let resolutionMessage = '';
  
  switch (resolutionType) {
    case 'full_refund':
      resolutionMessage = `We have issued a <strong>full refund</strong> to your original payment method. Please allow 5-10 business days for the refund to appear in your account.`;
      break;
    case 'partial_refund':
      resolutionMessage = `We have issued a <strong>partial refund</strong> to your original payment method. Please allow 5-10 business days for the refund to appear in your account.`;
      break;
    case 'replacement':
      resolutionMessage = `We are sending you a <strong>replacement item</strong> at no additional cost. You will receive a shipping confirmation email with tracking information once your replacement ships.`;
      break;
    case 'store_credit':
      resolutionMessage = `We have added <strong>store credit</strong> to your account. You can use this credit on your next purchase.`;
      break;
    case 'denied':
      resolutionMessage = `After careful review, we were unable to approve your claim at this time.`;
      break;
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6B4E3D; margin: 0; font-size: 28px;">🐾 GetPawsy</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">Your Claim Has Been Resolved</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Good news! Your claim (Reference: ${disputeId.slice(0, 8).toUpperCase()}) has been resolved.
          </p>
          
          <div style="background: ${resolutionType === 'denied' ? '#FFF3E0' : '#E8F5E9'}; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0; color: ${resolutionType === 'denied' ? '#E65100' : '#2E7D32'}; line-height: 1.6;">
              ${resolutionMessage}
            </p>
          </div>
          
          ${resolutionNotes ? `
            <div style="background: #F5F5F5; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; color: #333; font-weight: bold;">Additional Notes:</p>
              <p style="margin: 0; color: #666;">${resolutionNotes}</p>
            </div>
          ` : ''}
          
          <p style="color: #666; line-height: 1.6;">
            Thank you for your patience during this process. We value your trust in GetPawsy and hope to continue 
            serving you and your furry friends!
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://getpawsy.pet" 
               style="display: inline-block; background: #6B4E3D; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Continue Shopping
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center;">
            <p style="color: #999; font-size: 14px; margin: 0;">
              GetPawsy - Premium Pet Products<br>
              Making pets happy, one product at a time 🐕🐈
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: DisputeRequest = await req.json();
    const { action } = body;

    // For create action, no auth required (customers can submit disputes)
    // For other actions, require admin authentication
    if (action !== 'create') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
      
      if (claimsError || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userId = claimsData.claims.sub;
      
      // Check admin role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let result;

    switch (action) {
      case 'create': {
        const { orderId, customerEmail, disputeType, description, evidence } = body;

        if (!orderId || !customerEmail || !disputeType || !description) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Server-side email validation
        const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
        if (!emailRegex.test(customerEmail) || customerEmail.length > 255 || customerEmail.length < 5) {
          return new Response(
            JSON.stringify({ error: 'Invalid email address' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate dispute type
        const validDisputeTypes = ['damaged', 'not_received', 'wrong_item', 'quality_issue', 'other'];
        if (!validDisputeTypes.includes(disputeType)) {
          return new Response(
            JSON.stringify({ error: 'Invalid dispute type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate description length
        if (description.length < 10 || description.length > 5000) {
          return new Response(
            JSON.stringify({ error: 'Description must be between 10 and 5000 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate evidence URLs if provided
        if (evidence && Array.isArray(evidence)) {
          if (evidence.length > 10) {
            return new Response(
              JSON.stringify({ error: 'Maximum 10 evidence items allowed' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          const urlPattern = /^https?:\/\/.+/i;
          for (const url of evidence) {
            if (typeof url !== 'string' || url.length > 2000 || !urlPattern.test(url)) {
              return new Response(
                JSON.stringify({ error: 'Invalid evidence URL format' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        // IP-based rate limiting (5 disputes per hour per IP)
        const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                         req.headers.get('cf-connecting-ip') || 
                         'unknown';
        
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        // Check recent disputes from this IP (using customer email as proxy since we don't store IPs)
        const { count: recentDisputeCount } = await supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .eq('customer_email', customerEmail.toLowerCase())
          .gte('created_at', oneHourAgo);
        
        if (recentDisputeCount && recentDisputeCount >= 5) {
          return new Response(
            JSON.stringify({ error: 'Too many disputes submitted. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create the dispute
        const { data: dispute, error: createError } = await supabase
          .from('disputes')
          .insert({
            order_id: orderId,
            customer_email: customerEmail.toLowerCase().trim(),
            dispute_type: disputeType,
            description: description.trim(),
            customer_evidence: evidence || [],
            status: 'pending',
          })
          .select()
          .single();

        if (createError) {
          console.error('Create dispute error:', createError);
          throw createError;
        }

        // Add system message
        await supabase
          .from('dispute_messages')
          .insert({
            dispute_id: dispute.id,
            sender_type: 'system',
            message: `Claim submitted for order. Issue type: ${DISPUTE_TYPE_LABELS[disputeType] || disputeType}`,
          });

        // Send confirmation email
        await sendDisputeEmail(
          customerEmail,
          'We\'ve Received Your Claim - GetPawsy',
          generateDisputeConfirmationEmail(dispute.id, disputeType)
        );

        result = { success: true, disputeId: dispute.id };
        break;
      }

      case 'update_status': {
        const { disputeId, status, message } = body;

        if (!disputeId || !status) {
          return new Response(
            JSON.stringify({ error: 'Missing disputeId or status' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update dispute status
        const { data: dispute, error: updateError } = await supabase
          .from('disputes')
          .update({ status })
          .eq('id', disputeId)
          .select('customer_email')
          .single();

        if (updateError) throw updateError;

        // Add status update message
        await supabase
          .from('dispute_messages')
          .insert({
            dispute_id: disputeId,
            sender_type: 'system',
            message: `Status updated to: ${STATUS_LABELS[status] || status}`,
          });

        // If there's a custom message, add it
        if (message) {
          await supabase
            .from('dispute_messages')
            .insert({
              dispute_id: disputeId,
              sender_type: 'admin',
              message: message,
            });
        }

        // Send email notification with dynamic subject based on status
        const emailConfig = STATUS_EMAIL_CONFIG[status] || STATUS_EMAIL_CONFIG.in_progress;
        await sendDisputeEmail(
          dispute.customer_email,
          `${emailConfig.subject} - GetPawsy`,
          generateStatusUpdateEmail(disputeId, status, message)
        );

        result = { success: true };
        break;
      }

      case 'add_message': {
        const { disputeId, message, isInternal, senderType, customerEmail, attachments } = body;

        if (!disputeId || (!message && (!attachments || attachments.length === 0))) {
          return new Response(
            JSON.stringify({ error: 'Missing disputeId or message/attachments' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Determine sender type - customers can only send as 'customer'
        const actualSenderType = senderType === 'customer' ? 'customer' : 'admin';

        // For customer messages, verify they own this dispute
        if (actualSenderType === 'customer') {
          if (!customerEmail) {
            return new Response(
              JSON.stringify({ error: 'Customer email required for customer messages' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const { data: dispute } = await supabase
            .from('disputes')
            .select('customer_email')
            .eq('id', disputeId)
            .single();

          if (!dispute || dispute.customer_email.toLowerCase() !== customerEmail.toLowerCase()) {
            return new Response(
              JSON.stringify({ error: 'Unauthorized to send message on this dispute' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { error: msgError } = await supabase
          .from('dispute_messages')
          .insert({
            dispute_id: disputeId,
            sender_type: actualSenderType,
            message: message || '',
            is_internal: actualSenderType === 'customer' ? false : (isInternal || false),
            attachments: attachments || [],
          });

        if (msgError) throw msgError;

        // If admin message and not internal, send email to customer
        if (actualSenderType === 'admin' && !isInternal) {
          const { data: dispute } = await supabase
            .from('disputes')
            .select('customer_email, status')
            .eq('id', disputeId)
            .single();

          if (dispute) {
            await sendDisputeEmail(
              dispute.customer_email,
              'Message from GetPawsy Support',
              generateStatusUpdateEmail(disputeId, dispute.status, message)
            );
          }
        }

        result = { success: true };
        break;
      }

      case 'resolve': {
        const { disputeId, resolutionType, resolutionAmount, resolutionNotes } = body;

        if (!disputeId || !resolutionType) {
          return new Response(
            JSON.stringify({ error: 'Missing disputeId or resolutionType' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Map resolution type to status
        const statusMap: Record<string, string> = {
          full_refund: 'resolved_refund',
          partial_refund: 'resolved_partial_refund',
          replacement: 'resolved_replacement',
          store_credit: 'resolved_refund',
          denied: 'denied',
        };

        const { data: dispute, error: resolveError } = await supabase
          .from('disputes')
          .update({
            status: statusMap[resolutionType] || 'resolved_refund',
            resolution_type: resolutionType,
            resolution_amount: resolutionAmount,
            resolution_notes: resolutionNotes,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', disputeId)
          .select('customer_email')
          .single();

        if (resolveError) throw resolveError;

        // Add resolution message
        await supabase
          .from('dispute_messages')
          .insert({
            dispute_id: disputeId,
            sender_type: 'system',
            message: `Claim resolved: ${resolutionType.replace('_', ' ')}${resolutionAmount ? ` - $${resolutionAmount}` : ''}`,
          });

        // Send resolution email
        await sendDisputeEmail(
          dispute.customer_email,
          'Your Claim Has Been Resolved - GetPawsy',
          generateResolutionEmail(disputeId, resolutionType, resolutionAmount, resolutionNotes)
        );

        result = { success: true };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Dispute management error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
