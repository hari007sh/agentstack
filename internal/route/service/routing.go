package service

import (
	"context"
	"fmt"
	"log/slog"
	"path"
	"sort"
	"sync"
	"sync/atomic"

	"github.com/agentstack/agentstack/internal/route/store"
)

// RoutingService handles model/provider selection based on routing rules.
type RoutingService struct {
	store  *store.Store
	logger *slog.Logger
	rrIdx  uint64 // round-robin counter
	mu     sync.RWMutex
}

// NewRoutingService creates a new RoutingService.
func NewRoutingService(s *store.Store, logger *slog.Logger) *RoutingService {
	return &RoutingService{store: s, logger: logger}
}

// RoutingDecision contains the selected provider and model for a request.
type RoutingDecision struct {
	ProviderID   string `json:"provider_id"`
	ProviderName string `json:"provider_name"`
	TargetModel  string `json:"target_model"`
	RouteName    string `json:"route_name,omitempty"`
	Strategy     string `json:"strategy"`
}

// MatchRoute finds the best matching route for a given model name within an organization.
// It matches routes using glob patterns on the model_pattern field and selects by priority.
func (rs *RoutingService) MatchRoute(ctx context.Context, orgID, model string) ([]store.Route, error) {
	routes, err := rs.store.ListEnabledRoutes(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("list enabled routes: %w", err)
	}

	var matched []store.Route
	for _, rt := range routes {
		ok, _ := path.Match(rt.ModelPattern, model)
		if ok {
			matched = append(matched, rt)
		}
	}
	return matched, nil
}

// SelectProvider picks a provider from the matched routes based on the routing strategy.
func (rs *RoutingService) SelectProvider(ctx context.Context, orgID string, routes []store.Route) (*RoutingDecision, error) {
	if len(routes) == 0 {
		return nil, fmt.Errorf("no matching routes")
	}

	// All routes within a match set share the same strategy (use the first route's strategy).
	strategy := routes[0].Strategy

	switch strategy {
	case "priority":
		return rs.selectByPriority(ctx, orgID, routes)
	case "cost":
		return rs.selectByCost(ctx, orgID, routes)
	case "latency":
		return rs.selectByLatency(ctx, orgID, routes)
	case "round_robin":
		return rs.selectRoundRobin(ctx, orgID, routes)
	default:
		return rs.selectByPriority(ctx, orgID, routes)
	}
}

// selectByPriority selects the route with the highest priority.
func (rs *RoutingService) selectByPriority(_ context.Context, orgID string, routes []store.Route) (*RoutingDecision, error) {
	sort.Slice(routes, func(i, j int) bool {
		return routes[i].Priority > routes[j].Priority
	})
	rt := routes[0]
	provider, err := rs.resolveProvider(context.Background(), orgID, rt.ProviderID)
	if err != nil {
		return nil, err
	}
	return &RoutingDecision{
		ProviderID:   rt.ProviderID,
		ProviderName: provider,
		TargetModel:  rt.TargetModel,
		RouteName:    rt.Name,
		Strategy:     "priority",
	}, nil
}

// selectByCost selects the cheapest route (placeholder: uses priority as proxy).
func (rs *RoutingService) selectByCost(ctx context.Context, orgID string, routes []store.Route) (*RoutingDecision, error) {
	// In a full implementation this would look up model pricing.
	// For now, use lowest weight as a proxy for cost.
	sort.Slice(routes, func(i, j int) bool {
		return routes[i].Weight < routes[j].Weight
	})
	rt := routes[0]
	provider, err := rs.resolveProvider(ctx, orgID, rt.ProviderID)
	if err != nil {
		return nil, err
	}
	return &RoutingDecision{
		ProviderID:   rt.ProviderID,
		ProviderName: provider,
		TargetModel:  rt.TargetModel,
		RouteName:    rt.Name,
		Strategy:     "cost",
	}, nil
}

// selectByLatency selects the route with the lowest expected latency (placeholder).
func (rs *RoutingService) selectByLatency(ctx context.Context, orgID string, routes []store.Route) (*RoutingDecision, error) {
	// Placeholder: use priority as proxy. A full implementation would track latency metrics.
	return rs.selectByPriority(ctx, orgID, routes)
}

// selectRoundRobin selects the next route in round-robin order.
func (rs *RoutingService) selectRoundRobin(ctx context.Context, orgID string, routes []store.Route) (*RoutingDecision, error) {
	idx := atomic.AddUint64(&rs.rrIdx, 1)
	rt := routes[int(idx)%len(routes)]
	provider, err := rs.resolveProvider(ctx, orgID, rt.ProviderID)
	if err != nil {
		return nil, err
	}
	return &RoutingDecision{
		ProviderID:   rt.ProviderID,
		ProviderName: provider,
		TargetModel:  rt.TargetModel,
		RouteName:    rt.Name,
		Strategy:     "round_robin",
	}, nil
}

// resolveProvider looks up a provider name by ID.
func (rs *RoutingService) resolveProvider(ctx context.Context, orgID, providerID string) (string, error) {
	p, err := rs.store.GetProvider(ctx, orgID, providerID)
	if err != nil {
		return "", fmt.Errorf("resolve provider: %w", err)
	}
	if p == nil {
		return "", fmt.Errorf("provider %s not found", providerID)
	}
	return p.Name, nil
}
