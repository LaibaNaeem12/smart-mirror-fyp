import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchAllCatalogItems } from "../api/tryonApi";
import { getMockCatalogItems } from "./mockCatalog";
import {
  TAB_ALL,
  buildCatalogTabs,
  filterItemsByTabId,
} from "./catalogFilters";

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [gender, setGender] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [activeTabId, setActiveTabId] = useState(TAB_ALL);
  const [selectedCloth, setSelectedClothState] = useState(null);

  useEffect(() => {
    if (!gender) {
      setItems([]);
      setCatalogError("");
      setLoading(false);
      setActiveTabId(TAB_ALL);
      setSelectedClothState(null);
      return;
    }

    let cancelled = false;
    setActiveTabId(TAB_ALL);
    setSelectedClothState(null);

    (async () => {
      setLoading(true);
      setCatalogError("");
      try {
        const data = await fetchAllCatalogItems({ gender });
        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled) {
          setItems(getMockCatalogItems(gender));
          setCatalogError("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gender]);

  const tabs = useMemo(() => buildCatalogTabs(items), [items]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(TAB_ALL);
    }
  }, [tabs, activeTabId]);

  const filteredItems = useMemo(
    () => filterItemsByTabId(items, tabs, activeTabId),
    [items, tabs, activeTabId]
  );

  useEffect(() => {
    setSelectedClothState((prev) => {
      if (!prev) return prev;
      const visible = filterItemsByTabId(items, tabs, activeTabId);
      const pid = prev._id ?? prev.id;
      const ok = visible.some((i) => String(i._id ?? i.id) === String(pid));
      return ok ? prev : null;
    });
  }, [activeTabId, items, tabs]);

  const setSelectedCloth = useCallback((item) => {
    setSelectedClothState(item);
  }, []);

  const value = useMemo(
    () => ({
      gender,
      setGender,
      items,
      filteredItems,
      loading,
      catalogError,
      tabs,
      activeTabId,
      setActiveTabId,
      selectedCloth,
      setSelectedCloth,
    }),
    [
      gender,
      items,
      filteredItems,
      loading,
      catalogError,
      tabs,
      activeTabId,
      selectedCloth,
      setSelectedCloth,
    ]
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog must be used within CatalogProvider");
  }
  return ctx;
}
