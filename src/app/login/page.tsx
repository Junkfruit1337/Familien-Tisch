import { getLoginPersonen } from "./actions";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const personen = await getLoginPersonen();
  return <LoginClient personen={personen.map((p) => ({ id: p.id, name: p.name, farbe: p.farbe }))} />;
}
