import { CatalogProvider } from "./catalog/CatalogContext";
import Home from "./pages/Home";

export default function App() {
  return (
    <CatalogProvider>
      <Home />
    </CatalogProvider>
  );
}
