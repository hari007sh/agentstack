package main

import (
	"fmt"
	"os"

	"github.com/agentstack/agentstack/cli"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("AgentStack CLI")
		fmt.Println()
		fmt.Println("Usage: agentstack <command> [args]")
		fmt.Println()
		fmt.Println("Commands:")
		fmt.Println("  test    Run test suites and quality gates")
		fmt.Println("  cost    View cost analytics and budgets")
		fmt.Println()
		os.Exit(0)
	}

	switch os.Args[1] {
	case "test":
		cli.TestCommand(os.Args[2:])
	case "cost":
		cli.CostCommand(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}
