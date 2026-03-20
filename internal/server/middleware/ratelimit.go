package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter provides Redis-based sliding window rate limiting.
type RateLimiter struct {
	client *redis.Client
	limit  int
	window time.Duration
}

// NewRateLimiter creates a new rate limiter.
func NewRateLimiter(client *redis.Client, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		client: client,
		limit:  limit,
		window: window,
	}
}

// Middleware returns an HTTP middleware that enforces rate limiting.
func (rl *RateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Use org_id from context if available, otherwise use IP
			identifier := GetOrgID(r.Context())
			if identifier == "" {
				identifier = r.RemoteAddr
			}

			key := fmt.Sprintf("ratelimit:%s", identifier)
			now := time.Now()

			ctx := r.Context()
			allowed, remaining, err := rl.check(ctx, key, now)
			if err != nil {
				// If Redis is down, allow the request (fail open)
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(rl.limit))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
			w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(now.Add(rl.window).Unix(), 10))

			if !allowed {
				writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "too many requests, please try again later")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func (rl *RateLimiter) check(ctx context.Context, key string, now time.Time) (bool, int, error) {
	windowStart := now.Add(-rl.window)

	pipe := rl.client.Pipeline()
	// Remove old entries outside the window
	pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(windowStart.UnixMicro(), 10))
	// Count entries in current window
	countCmd := pipe.ZCard(ctx, key)
	// Add current request
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now.UnixMicro()), Member: now.UnixMicro()})
	// Set expiry on the key
	pipe.Expire(ctx, key, rl.window)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, 0, err
	}

	count := int(countCmd.Val())
	remaining := rl.limit - count - 1
	if remaining < 0 {
		remaining = 0
	}

	return count < rl.limit, remaining, nil
}
