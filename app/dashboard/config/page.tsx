import { redirect } from "next/navigation"

export default function DashboardConfigRedirect() {
  redirect("/dashboard?tab=config")
}
