import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppLockGate } from "@/features/applock/AppLockGate";
import { WelcomeGate } from "@/features/welcome/WelcomeGate";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { TransactionsPage } from "@/features/transactions/TransactionsPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";
import { CardDetailPage } from "@/features/accounts/CardDetailPage";
import { BudgetPage } from "@/features/budget/BudgetPage";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { RecurrencesPage } from "@/features/recurrences/RecurrencesPage";
import { CategoriesPage } from "@/features/categories/CategoriesPage";
import { TagsPage } from "@/features/tags/TagsPage";
import { ChatPage } from "@/features/chat/ChatPage";
import { LegalPage } from "@/features/legal/LegalPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "cards/:id", element: <CardDetailPage /> },
      { path: "budget", element: <BudgetPage /> },
      { path: "goals", element: <GoalsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "recurrences", element: <RecurrencesPage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "tags", element: <TagsPage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "privacidade", element: <LegalPage doc="privacy" /> },
      { path: "termos", element: <LegalPage doc="terms" /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return (
    <AppLockGate>
      <WelcomeGate>
        <RouterProvider router={router} />
      </WelcomeGate>
    </AppLockGate>
  );
}
