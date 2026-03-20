"use client";

import { motion } from "framer-motion";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeIn } from "@/lib/animations";

export default function LoginPage() {
  const handleGitHubLogin = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/auth/github`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // GitHub OAuth not configured, redirect to dashboard for dev
      window.location.href = "/dashboard/overview";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm mx-auto p-8"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)] flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-xl font-semibold">AgentStack</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Login Button */}
        <Button
          onClick={handleGitHubLogin}
          className="w-full h-11 bg-white text-black hover:bg-gray-100 font-medium"
        >
          <Github className="w-5 h-5 mr-2" />
          Continue with GitHub
        </Button>

        <p className="text-xs text-[var(--text-tertiary)] text-center mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
