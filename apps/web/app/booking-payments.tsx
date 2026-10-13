"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Video, CreditCard } from "lucide-react";
import {
  api,
  ApiError,
  type components,
  type Dashboard,
  type Session,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
type Order = components["schemas"]["CheckoutOrder"];
type Current = components["schemas"]["CurrentCheckout"];
type GatewayOptions = {
  key: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  order_id: string;
  handler: () => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
type Gateway = {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", callback: () => void) => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: GatewayOptions) => Gateway;
  }
}
export const exactMoney = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const bookingTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function MeetingAccess({
  session,
  reservationId,
  confirmed,
}: {
  session: Session;
  reservationId: string;
  confirmed: boolean;
}) {
  const now = useClock();
  const participant = ["GUARDIAN", "TEACHER", "STUDENT"].includes(
    session.account.role,
  );
  const query = useQuery({
    queryKey: ["booking-meeting", session.account.id, reservationId],
    queryFn: ({ signal }) =>
      api<components["schemas"]["ReservationMeeting"]>(
        `/reservations/${reservationId}/meeting`,
        { signal },
      ),
    enabled: participant && confirmed,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const meeting = query.state.data?.meeting;
      return meeting &&
        now >= new Date(meeting.startsAt).getTime() - 600000 &&
        now <= new Date(meeting.endsAt).getTime() + 900000
        ? 30000
        : false;
    },
    gcTime: 0,
  });
  if (!participant || !confirmed) return null;
  const meeting = query.data?.meeting;
  let join: string | null = null;
  if (
    meeting?.providerMode === "LIVE" &&
    meeting.canJoin &&
    now >= new Date(meeting.startsAt).getTime() - 600000 &&
    now <= new Date(meeting.endsAt).getTime() + 900000 &&
    meeting.joinUrl
  ) {
    try {
      const url = new URL(meeting.joinUrl);
      if (
        url.protocol === "https:" &&
        url.hostname === "meet.google.com" &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)
      )
        join = url.href;
    } catch {}
  }
  return (
    <section className="booking-meeting" aria-label="Private meeting access">
      <div className="booking-meeting-title">
        <Video size={20} aria-hidden="true" />
        <h4>Your private meeting</h4>
        <span className="booking-status">
          {meeting?.providerMode === "SANDBOX"
            ? "Development preview"
            : meeting?.status.toLowerCase() || "Awaiting meeting"}
        </span>
      </div>
      {query.isPending && <p role="status">Checking private meeting access…</p>}
      {query.error && (
        <Notice error>
          {query.error.message} Refresh access or contact support.
        </Notice>
      )}
      {!query.isPending && !query.error && !meeting && (
        <p>
          A private meeting has not been created for this booking. Home lessons
          do not need a meeting link; contact support if an online link is
          missing.
        </p>
      )}
      {meeting?.providerMode === "SANDBOX" && (
        <p>
          This development meeting cannot be joined. No live Google Meet session
          is provided.
        </p>
      )}
      {meeting?.providerMode === "LIVE" && (
        <p>
          {meeting.status === "FAILED"
            ? "Meeting delivery needs attention. Contact support; refreshing checks the current state."
            : meeting.status === "CANCELLED"
              ? "This meeting is cancelled."
              : meeting.status === "PENDING"
                ? "Your private meeting is being prepared."
                : join
                  ? "Your join window is open."
                  : now > new Date(meeting.endsAt).getTime() + 900000
                    ? "The meeting join window has ended."
                    : meeting.canJoin
                      ? "A valid Google Meet link is unavailable. Contact support."
                      : "The join link appears from ten minutes before the scheduled start until fifteen minutes after the scheduled end."}
        </p>
      )}
      <div className="booking-actions">
        {join && (
          <a
            className="button"
            href={join}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Join Google Meet
          </a>
        )}
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          Refresh meeting access
        </Button>
        <Link href="/support" className="inline-link">
          Get meeting help
        </Link>
      </div>
    </section>
  );
}
export function CheckoutReview({
  session,
  kind,
  resourceId,
  amountPaise,
  expectedVersion,
  policy,
  ready,
  refresh,
  onLock,
  payable,
}: {
  session: Session;
  kind: "REVISION" | "INVOICE";
  resourceId: string;
  amountPaise: number;
  expectedVersion: number;
  policy: string;
  ready: (current: Dashboard) => boolean;
  refresh: () => Promise<Dashboard>;
  onLock?: (locked: boolean) => void;
  payable: boolean;
}) {
  const allowed =
    kind === "REVISION"
      ? session.account.role === "GUARDIAN"
      : session.account.role === "TEACHER";
  async function loadCurrent(signal?: AbortSignal) {
    const value = await api<Current>(
      `/checkout-orders?${new URLSearchParams({ kind, resourceId })}`,
      { signal },
    );
    const order = value?.order;
    if (
      !value ||
      !("order" in value) ||
      !(value.publicKeyId === null || typeof value.publicKeyId === "string") ||
      (order !== null &&
        (!order ||
          typeof order.id !== "string" ||
          order.resourceId !== resourceId ||
          order.kind !== kind ||
          order.currency !== "INR" ||
          !Number.isSafeInteger(order.amountPaise) ||
          order.amountPaise <= 0 ||
          !["SANDBOX", "LIVE"].includes(order.providerMode) ||
          !["CREATING", "CREATED", "PAID", "FAILED"].includes(order.status)))
    )
      throw new ApiError(
        502,
        "INVALID_RESPONSE",
        "Saved checkout details could not be verified. Refresh or contact support before paying.",
      );
    return value;
  }
  const query = useQuery({
    queryKey: ["current-checkout", session.account.id, kind, resourceId],
    queryFn: ({ signal }) => loadCurrent(signal),
    enabled: allowed,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [fallback, setFallback] = useState<Order | null>(null),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false),
    [loadScript, setLoadScript] = useState(false),
    [scriptError, setScriptError] = useState(false),
    [preparing, setPreparing] = useState(false),
    [gatewayBusy, setGatewayBusy] = useState(false),
    [needsCheck, setNeedsCheck] = useState(false),
    [notice, setNotice] = useState("");
  const succeeded = useRef(false),
    preparingRef = useRef(false),
    gateway = useRef<Gateway | null>(null),
    alive = useRef(true),
    launching = useRef(false);
  const focus = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      gateway.current?.close();
    };
  }, []);
  useEffect(() => {
    if (review) {
      focus.current?.focus();
      focus.current?.scrollIntoView({ block: "nearest" });
    }
  }, [review]);
  async function reload() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    await refresh();
  }
  const decision = useDecision(
    session,
    reload,
    (result) =>
      !!result &&
      typeof result === "object" &&
      "id" in result &&
      typeof result.id === "string" &&
      "resourceId" in result &&
      result.resourceId === resourceId &&
      "kind" in result &&
      result.kind === kind &&
      "currency" in result &&
      result.currency === "INR" &&
      "amountPaise" in result &&
      result.amountPaise === amountPaise,
  );
  const order = query.data?.order || fallback;
  useEffect(() => {
    if (order?.status === "PAID" || order?.status === "FAILED") {
      setNeedsCheck(false);
      setGatewayBusy(false);
      launching.current = false;
    }
  }, [order?.status]);
  const matches =
    !!order &&
    order.resourceId === resourceId &&
    order.kind === kind &&
    order.currency === "INR" &&
    order.amountPaise === amountPaise &&
    Number.isSafeInteger(order.amountPaise) &&
    order.amountPaise > 0;
  const locked = preparing || decision.locked || gatewayBusy || needsCheck;
  useEffect(() => {
    if (!payable && gatewayBusy) gateway.current?.close();
  }, [payable, gatewayBusy]);
  useEffect(() => {
    onLock?.(locked);
  }, [locked, onLock]);
  if (!allowed) return null;
  async function create() {
    if (preparingRef.current || decision.locked || !payable || order) return;
    if (!agreed) {
      decision.invalid(
        "Review the exact amount and payment basis before creating checkout.",
      );
      return;
    }
    preparingRef.current = true;
    setPreparing(true);
    try {
      try {
        const current = await refresh();
        if (!ready(current)) {
          decision.invalid(
            "This booking or invoice is no longer payable. Review its current details.",
          );
          return;
        }
      } catch {
        decision.invalid(
          "Current booking details could not be loaded. Refresh before creating checkout.",
        );
        return;
      }
      await decision.run({
        path: "/checkout-orders",
        body: { kind, resourceId, expectedVersion },
        message:
          "Checkout order saved. Payment and booking confirmation are separate.",
        onSaved: (result) => {
          setFallback(result as Order);
          setReview(false);
        },
      });
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }
  async function check() {
    try {
      await reload();
      setNotice(
        "Payment status refreshed. A Razorpay response alone does not confirm a booking.",
      );
      if (!succeeded.current) {
        setNeedsCheck(false);
      }
    } catch {
      setNotice(
        "Payment status could not be confirmed. Keep this order and check again; do not create another payment.",
      );
    }
  }
  async function launch() {
    if (
      launching.current ||
      gatewayBusy ||
      needsCheck ||
      decision.locked ||
      !payable
    )
      return;
    launching.current = true;
    setGatewayBusy(true);
    setNotice("");
    try {
      const current = await refresh(),
        fresh = await loadCurrent();
      const saved = fresh.order;
      if (
        !ready(current) ||
        !saved ||
        saved.id !== order?.id ||
        saved.status !== "CREATED" ||
        saved.providerMode !== "LIVE" ||
        saved.amountPaise !== amountPaise ||
        saved.currency !== "INR" ||
        !saved.providerOrderId ||
        !fresh.publicKeyId
      )
        throw new Error(
          "Current checkout is not payable. Refresh its status before continuing.",
        );
      if (!window.Razorpay)
        throw new Error(
          "Secure checkout could not load. Refresh the page to retry the saved order.",
        );
      succeeded.current = false;
      function verify(message: string) {
        if (!alive.current) return;
        setGatewayBusy(false);
        launching.current = false;
        setNeedsCheck(true);
        setNotice(message);
        void reload().catch(() => {
          if (alive.current)
            setNotice(
              "Payment status could not be confirmed. Check the saved order again; do not make another payment.",
            );
        });
      }
      const instance = new window.Razorpay({
        key: fresh.publicKeyId,
        amount: saved.amountPaise,
        currency: "INR",
        name: "Better Call Sir",
        description:
          kind === "REVISION"
            ? "Scheduled revision session"
            : "Teacher placement fee",
        order_id: saved.providerOrderId,
        theme: { color: "#034F46" },
        handler: () => {
          succeeded.current = true;
          verify(
            "Razorpay returned a payment response. Waiting for server confirmation from the signed payment event.",
          );
        },
        modal: {
          ondismiss: () => {
            if (!succeeded.current)
              verify(
                "Checkout closed. Check the saved order status before reopening it.",
              );
          },
        },
      });
      gateway.current = instance;
      instance.on("payment.failed", () => {
        instance.close();
        verify(
          "This payment attempt was not confirmed. Check the saved order before trying again.",
        );
      });
      instance.open();
    } catch (e) {
      setGatewayBusy(false);
      launching.current = false;
      setNotice((e as Error).message);
    }
  }
  const providerReady =
    payable &&
    matches &&
    order?.status === "CREATED" &&
    order.providerMode === "LIVE" &&
    !!query.data?.publicKeyId &&
    !!order.providerOrderId;
  return (
    <section
      className="checkout-card"
      aria-label={
        kind === "REVISION" ? "Revision checkout" : "Invoice checkout"
      }
    >
      <div className="checkout-amount">
        <CreditCard size={22} aria-hidden="true" />
        <div>
          <span>
            {kind === "REVISION"
              ? "Revision session total"
              : "Teacher placement fee"}
          </span>
          <strong>{exactMoney(amountPaise)}</strong>
          <small>INR · {policy}</small>
        </div>
      </div>
      <div className="checkout-body">
        <h4>
          {matches && order?.status === "PAID"
            ? "Payment captured by the server"
            : order
              ? "Your saved checkout"
              : "Review before payment"}
        </h4>
        <p>
          {kind === "REVISION"
            ? "Expert scope acceptance, payment capture and slot allocation are separate checks. The booking is confirmed only when its status says confirmed."
            : "This pays the teacher placement invoice. Family tuition is paid directly to the teacher."}
        </p>
        {query.isPending && <p role="status">Checking saved checkout…</p>}
        {query.error && <Notice error>{query.error.message}</Notice>}
        {order && (
          <p className="checkout-reference">
            Order {order.id.slice(0, 8)} ·{" "}
            {order.status.toLowerCase().replaceAll("_", " ")}
          </p>
        )}
        {order && !matches && (
          <Notice error>
            The saved order does not match this amount or booking. Contact
            support before paying.
          </Notice>
        )}
        {order?.providerMode === "SANDBOX" && (
          <Notice>
            This is a local sandbox order. It cannot charge money or open
            Razorpay. No live payment is confirmed.
          </Notice>
        )}
        {matches && order?.status === "PAID" && (
          <Notice>
            Payment capture is recorded. Review the booking or invoice status
            separately; refunds and settlement are separate processes.
          </Notice>
        )}
        {order?.status === "FAILED" && (
          <Notice>
            Checkout needs provider review. Contact support before creating
            another payment.
          </Notice>
        )}
        {order?.providerMode === "LIVE" &&
          order.status === "CREATED" &&
          !query.data?.publicKeyId && (
            <Notice>
              Razorpay checkout configuration is unavailable. Your order remains
              saved; contact support.
            </Notice>
          )}
        {notice && <Notice>{notice}</Notice>}
        {scriptError && (
          <Notice error>
            Secure checkout could not load. Refresh the page to retry this saved
            order.
          </Notice>
        )}
        <div className="booking-actions">
          {payable && !order && !query.isPending && !query.error && (
            <Button
              className="button"
              disabled={locked}
              onClick={() => setReview(true)}
            >
              Review payment
            </Button>
          )}
          {providerReady && !scriptError && (
            <Button
              className="button"
              disabled={locked || !agreed}
              onClick={() => {
                if (window.Razorpay) void launch();
                else setLoadScript(true);
              }}
            >
              {gatewayBusy
                ? "Checkout open…"
                : needsCheck
                  ? "Awaiting payment confirmation"
                  : "Continue to Razorpay"}
            </Button>
          )}
          {payable &&
            order?.providerMode === "LIVE" &&
            order.status === "CREATED" &&
            !agreed && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => setReview(true)}
              >
                Review payment terms
              </Button>
            )}
          <Button
            variant="outline"
            disabled={decision.busy || decision.uncertain || gatewayBusy}
            onClick={() => {
              if (decision.conflict) void decision.reload();
              else void check();
            }}
          >
            Check payment status
          </Button>
          {scriptError && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh page to reload checkout
            </Button>
          )}
        </div>
        {review && (
          <div className="checkout-review" ref={focus} tabIndex={-1}>
            <h4>Confirm the payment basis</h4>
            <p>
              {exactMoney(amountPaise)} under {policy}.{" "}
              {kind === "REVISION"
                ? "No syllabus or score guarantee. Cancellation, allocation loss and refunds require the current policy and support review; no settled refund is promised."
                : "The server-owned invoice amount and policy apply. This is separate from monthly tuition."}
            </p>
            <fieldset disabled={locked}>
              <label className="booking-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I reviewed the exact amount, payment basis and pending
                  refund/settlement limits.
                </span>
              </label>
              <div className="booking-actions">
                <Button variant="outline" onClick={() => setReview(false)}>
                  Cancel review
                </Button>
                <Button
                  className="button"
                  onClick={() => (order ? setReview(false) : void create())}
                >
                  {order ? "Save payment review" : "Create secure checkout"}
                </Button>
              </div>
            </fieldset>
          </div>
        )}
        <Feedback decision={decision} />
        <Link href="/support" className="inline-link">
          Get payment help
        </Link>
      </div>
      {loadScript && !scriptError && (
        <Script
          id="razorpay-checkout"
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
          onReady={() => {
            if (alive.current) void launch();
          }}
          onError={() => {
            setScriptError(true);
            setLoadScript(false);
          }}
        />
      )}
    </section>
  );
}
