import BentoHub from "@/components/hub/BentoHub";

// Portada: lanzador del hub en una pantalla (components/hub/BentoHub.jsx).
// El chrome (auth, cabecera, splash, transiciones) vive en AppFrame (layout).
export default function Home() {
  return <BentoHub />;
}
