import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

// Token cache to avoid rate limiting (CJ allows 1 auth request per 300 seconds)
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

interface CJAuthResponse {
  result: boolean;
  code: number;
  message?: string;
  data: {
    accessToken: string;
    accessTokenExpiryDate: string;
    refreshToken: string;
    refreshTokenExpiryDate: string;
  };
}

interface CJProductListRequest {
  pageNum?: number;
  pageSize?: number;
  categoryId?: string;
  productNameEn?: string;
}

interface CJOrderRequest {
  orderNumber: string;
  shippingZip: string;
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingCustomerName: string;
  shippingPhone: string;
  products: Array<{
    vid: string;
    quantity: number;
  }>;
  remark?: string;
  logisticName?: string;
  fromCountryCode?: string;
}

// Get access token from CJ API with caching
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('Using cached CJ access token');
    return cachedToken;
  }

  const apiKey = Deno.env.get('CJ_API_KEY');
  const email = Deno.env.get('CJ_EMAIL');

  if (!apiKey || !email) {
    throw new Error('CJ_API_KEY or CJ_EMAIL not configured');
  }

  console.log('Requesting new CJ access token...');
  
  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email,
      password: apiKey,
    }),
  });

  const data: CJAuthResponse = await response.json();
  
  if (!data.result) {
    console.error('CJ Auth failed:', data);
    // If rate limited, suggest waiting
    if (data.code === 1600200) {
      throw new Error('CJ API rate limited - please wait 5 minutes before trying again');
    }
    throw new Error(`CJ Authentication failed: ${data.code} - ${data.message || 'Unknown error'}`);
  }

  // Cache the token - set expiry 5 minutes before actual expiry for safety
  cachedToken = data.data.accessToken;
  const expiryDate = new Date(data.data.accessTokenExpiryDate).getTime();
  tokenExpiry = expiryDate - (5 * 60 * 1000); // 5 minutes buffer
  
  console.log('New CJ access token obtained, expires:', data.data.accessTokenExpiryDate);

  return cachedToken;
}

// Fetch products from CJ Dropshipping
async function fetchProducts(accessToken: string, params: CJProductListRequest) {
  const response = await fetch(`${CJ_API_BASE}/product/list`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Products response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Get product details by ID
async function getProductById(accessToken: string, productId: string) {
  const response = await fetch(`${CJ_API_BASE}/product/query?pid=${productId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Product detail response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Search products by keyword
async function searchProducts(accessToken: string, keyword: string, pageNum = 1, pageSize = 20) {
  const params = new URLSearchParams({
    productNameEn: keyword,
    pageNum: pageNum.toString(),
    pageSize: pageSize.toString(),
  });

  const response = await fetch(`${CJ_API_BASE}/product/list?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Search response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Create order in CJ Dropshipping
async function createOrder(accessToken: string, orderData: CJOrderRequest) {
  const response = await fetch(`${CJ_API_BASE}/shopping/order/createOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
    body: JSON.stringify(orderData),
  });

  const data = await response.json();
  console.log('CJ Create order response:', JSON.stringify(data));
  return data;
}

// Get order status from CJ
async function getOrderStatus(accessToken: string, orderId: string) {
  const response = await fetch(`${CJ_API_BASE}/shopping/order/getOrderDetail?orderId=${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Order status response:', JSON.stringify(data));
  return data;
}

// Get shipping info
async function getShippingInfo(accessToken: string, orderId: string) {
  const response = await fetch(`${CJ_API_BASE}/logistic/getTrackInfo?orderId=${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Shipping info response:', JSON.stringify(data));
  return data;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    console.log(`CJ Dropshipping action: ${action}`, params);

    // Get access token first
    const accessToken = await getAccessToken();

    let result;

    switch (action) {
      case 'list-products':
        result = await fetchProducts(accessToken, params);
        break;

      case 'get-product':
        if (!params.productId) {
          throw new Error('productId is required');
        }
        result = await getProductById(accessToken, params.productId);
        break;

      case 'search-products':
        if (!params.keyword) {
          throw new Error('keyword is required');
        }
        result = await searchProducts(
          accessToken, 
          params.keyword, 
          params.pageNum || 1, 
          params.pageSize || 20
        );
        break;

      case 'create-order':
        if (!params.orderData) {
          throw new Error('orderData is required');
        }
        result = await createOrder(accessToken, params.orderData);
        break;

      case 'get-order-status':
        if (!params.orderId) {
          throw new Error('orderId is required');
        }
        result = await getOrderStatus(accessToken, params.orderId);
        break;

      case 'get-shipping':
        if (!params.orderId) {
          throw new Error('orderId is required');
        }
        result = await getShippingInfo(accessToken, params.orderId);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('CJ Dropshipping error:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
