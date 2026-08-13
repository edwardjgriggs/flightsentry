import { MissionConsole } from "@/components/mission-console";
import { getAllScenarios } from "@/lib/scenarios";

export default function Home() {
  return <MissionConsole scenarios={getAllScenarios()} />;
}
