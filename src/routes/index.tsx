import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/aurion/desk-app";

export const Route = createFileRoute("/")({ component: DeskApp });
