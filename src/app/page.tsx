"use client";

import { usePageTitle } from "@/hooks/useEnvironment";
import { HomeListening } from "@/components/home/HomeListening";
import { HomeStage } from "@/components/home/HomeStage";

export default function HomePage() {
  usePageTitle();

  return (
    <>
      <HomeListening />
      <HomeStage />
    </>
  );
}
