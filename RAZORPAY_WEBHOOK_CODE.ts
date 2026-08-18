/// <reference path="./globals.d.ts" />
// supabase/functions/razorpay-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

async function getHmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const value = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(value)) return null;
    out[i / 2] = value;
  }
  return out;
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const a = hexToBytes(aHex);
  const b = hexToBytes(bHex);
  if (!a || !b || a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const signature = req.headers.get("x-razorpay-signature");
    const bodyText = await req.text();
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

    // Verify Razorpay Signature securely
    if (!signature || !webhookSecret) {
      return jsonResponse({ error: "Unauthorized: Missing signature or webhook secret" }, 400);
    }

    const expectedSignature = await getHmacSha256Hex(webhookSecret, bodyText);

    if (!timingSafeHexEqual(signature, expectedSignature)) {
      return jsonResponse({ error: "Unauthorized: Invalid signature" }, 400);
    }

    let event: Record<string, any>;
    try {
      event = JSON.parse(bodyText);
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }

    if (event.event === "payment.captured") {
      // Initialize Supabase Admin Client to bypass RLS
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supabaseUrl || !serviceRoleKey) {
        return jsonResponse({ error: "Supabase admin credentials are not configured" }, 500);
      }

      const supabaseAdmin = createClient(
        supabaseUrl,
        serviceRoleKey,
      );

      const paymentEntity = event?.payload?.payment?.entity ?? {};
      const paymentId = paymentEntity?.id;
      // Extract the notes we pass from the frontend
      const notes = paymentEntity?.notes ?? {};
      const user_id = notes.user_id;
      const product_ids = notes.product_ids;
      const coupon_code = String(notes.coupon_code ?? "").trim().toUpperCase();
      const isWalletTopup = String(notes.wallet_topup ?? "") === "true";

      if (!paymentId || !user_id) {
        return jsonResponse({ error: "Missing payment id or user id" }, 400);
      }

      if (isWalletTopup) {
        const amountPaise = Number(paymentEntity?.amount || 0);
        const amount = Math.round(amountPaise) / 100;
        if (!Number.isFinite(amount) || amount <= 0) {
          return jsonResponse({ error: "Invalid top-up amount" }, 400);
        }

        const { data: existingTopup } = await supabaseAdmin
          .from("admin_wallet_logs")
          .select("id")
          .eq("seller_id", user_id)
          .ilike("reason", `%${paymentId}%`)
          .limit(1);

        if (existingTopup && existingTopup.length > 0) {
          return jsonResponse({ success: true, message: "Top-up already processed" }, 200);
        }

        const { data: walletRow, error: walletFetchErr } = await supabaseAdmin
          .from("users")
          .select("wallet_balance")
          .eq("id", user_id)
          .single();

        if (walletFetchErr) {
          return jsonResponse({ error: "Failed to fetch wallet" }, 500);
        }

        const currentBal = Number(walletRow?.wallet_balance || 0);
        const newBal = currentBal + amount;

        const { error: walletErr } = await supabaseAdmin
          .from("users")
          .update({ wallet_balance: newBal })
          .eq("id", user_id);

        if (walletErr) {
          return jsonResponse({ error: "Failed to update wallet" }, 500);
        }

        const { error: logErr } = await supabaseAdmin.from("admin_wallet_logs").insert({
          seller_id: user_id,
          type: "credit",
          amount: amount,
          reason: `Wallet top-up (Razorpay: ${paymentId})`,
          admin_id: null
        });

        if (logErr) {
          console.error("Failed to create wallet log:", logErr);
          return jsonResponse({ error: "Failed to create transaction log" }, 500);
        }

        return jsonResponse({ success: true, wallet_balance: newBal }, 200);
      }

      if (!product_ids) {
        return jsonResponse({ error: "Missing product ids for order processing" }, 400);
      }

      // Convert comma-separated string back to array of IDs
      const productIdsArray = Array.isArray(product_ids)
        ? product_ids
        : String(product_ids).split(",");
      const cleanedProductIds = productIdsArray
        .map((id: unknown) => String(id).trim())
        .filter((id: string) => id.length > 0);

      if (cleanedProductIds.length === 0) {
        return jsonResponse({ error: "No valid product ids provided" }, 400);
      }

      const uniqueProductIds = Array.from(new Set(cleanedProductIds));
      const { data: existingOrders } = await supabaseAdmin
        .from("orders")
        .select("product_id")
        .eq("user_id", user_id)
        .eq("payment_id", paymentId)
        .in("product_id", uniqueProductIds);

      const existingProductIds = new Set((existingOrders || []).map((row: any) => String(row.product_id)));
      const productIdsToInsert = uniqueProductIds.filter((id) => !existingProductIds.has(id));

      if (productIdsToInsert.length === 0) {
        return jsonResponse({ success: true, message: "Orders already synced" }, 200);
      }

      const { data: products, error: productsError } = await supabaseAdmin
        .from("products")
        .select("id, price")
        .in("id", productIdsToInsert);
      if (productsError) throw productsError;
      if (!products || products.length === 0) {
        return jsonResponse({ error: "No valid products found for payment" }, 400);
      }

      const productPriceById = new Map<string, number>();
      for (const product of products) {
        productPriceById.set(String(product.id), Number(product.price || 0));
      }

      const expandedRows = productIdsToInsert
        .map((id: string) => ({ productId: id, unitPrice: productPriceById.get(id) ?? 0 }))
        .filter((row) => row.unitPrice >= 0);
      const subtotal = expandedRows.reduce((acc, row) => acc + row.unitPrice, 0);

      let couponDiscount = 0;
      let couponCodeToPersist: string | null = null;

      if (coupon_code && subtotal > 0) {
        const nowIso = new Date().toISOString();
        const { data: coupon, error: couponError } = await supabaseAdmin
          .from("coupons")
          .select("*")
          .eq("code", coupon_code)
          .eq("is_active", true)
          .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
          .maybeSingle();

        if (!couponError && coupon) {
          const minCartValue = Number(coupon.min_cart_value || 0);
          const usageLimit = Number(coupon.usage_limit || 0);
          const usedCount = Number(coupon.used_count || 0);
          const usageAvailable = usageLimit <= 0 || usedCount < usageLimit;

          if (subtotal >= minCartValue && usageAvailable) {
            const percentDiscount = Number(coupon.discount_percent || 0) > 0
              ? (subtotal * Number(coupon.discount_percent)) / 100
              : 0;
            const flatDiscount = Number(coupon.discount_amount || 0);
            let rawDiscount = percentDiscount > 0 ? percentDiscount : flatDiscount;
            const maxDiscount = Number(coupon.max_discount || 0);
            if (maxDiscount > 0) rawDiscount = Math.min(rawDiscount, maxDiscount);
            couponDiscount = Math.min(subtotal, Math.max(0, Number(rawDiscount.toFixed(2))));
            couponCodeToPersist = coupon.code;

            await supabaseAdmin
              .from("coupons")
              .update({ used_count: usedCount + 1 })
              .eq("id", coupon.id);
          }
        }
      }

      const finalTotal = Math.max(0, Number((subtotal - couponDiscount).toFixed(2)));
      const discountRatio = subtotal > 0 ? couponDiscount / subtotal : 0;
      let allocatedDiscount = 0;

      // Allocate discount proportionally per item and fix rounding on the last row.
      const ordersToInsert = expandedRows.map((row, index) => {
        const unitPrice = Number(row.unitPrice.toFixed(2));
        let perItemDiscount = Number((unitPrice * discountRatio).toFixed(2));
        if (index === expandedRows.length - 1) {
          perItemDiscount = Number((couponDiscount - allocatedDiscount).toFixed(2));
        }
        perItemDiscount = Math.min(unitPrice, Math.max(0, perItemDiscount));
        allocatedDiscount = Number((allocatedDiscount + perItemDiscount).toFixed(2));
        const finalPrice = Number((unitPrice - perItemDiscount).toFixed(2));

        return {
          user_id: user_id,
          product_id: row.productId,
          payment_id: paymentId,
          status: "paid",
          unit_price: unitPrice,
          discount_amount: perItemDiscount,
          coupon_code: couponCodeToPersist,
          final_price: finalPrice,
          order_subtotal: subtotal,
          order_discount_total: couponDiscount,
          order_final_total: finalTotal,
        };
      });

      // Insert securely via admin client.
      // Fallback to legacy payload if schema migrations for coupon/pricing fields are not applied yet.
      const { error } = await supabaseAdmin.from("orders").insert(ordersToInsert);
      if (error) {
        const legacyOrdersToInsert = productIdsToInsert.map((pId: string) => ({
          user_id: user_id,
          product_id: pId,
          payment_id: paymentId,
          status: "paid",
        }));

        const { error: legacyError } = await supabaseAdmin.from("orders").insert(legacyOrdersToInsert);
        if (legacyError) throw legacyError;
      }
    }

    return jsonResponse({ success: true }, 200);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", errorMessage);
    return jsonResponse({ error: errorMessage }, 500);
  }
});
