/**
 * Demo catalog when the API is unreachable — keeps category filters and grid populated.
 * Image URLs are stable Unsplash crops suitable for kiosk demos.
 */

const MEN = [
  {
    _id: "mock-m-1",
    name: "Oxford Casual Shirt",
    category: "shirts",
    gender: "men",
    tags: ["Casual wear", "University"],
    imageUrl:
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=480&h=720&fit=crop&q=80",
  },
  {
    _id: "mock-m-2",
    name: "Tailored Evening Jacket",
    category: "outerwear",
    gender: "men",
    tags: ["Evening", "Wedding guest"],
    imageUrl:
      "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=480&h=720&fit=crop&q=80",
  },
  {
    _id: "mock-m-3",
    name: "Slim Chinos",
    category: "bottoms",
    gender: "men",
    tags: ["Weekend", "Office"],
    imageUrl:
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=480&h=720&fit=crop&q=80",
  },
  {
    _id: "mock-m-4",
    name: "Leather Derby Shoes",
    category: "shoes",
    gender: "men",
    tags: ["Formal", "Wedding"],
    imageUrl:
      "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=480&h=720&fit=crop&q=80",
  },
];

const WOMEN = [
  {
    _id: "mock-w-1",
    name: "Silk Wedding Guest Dress",
    category: "dresses",
    gender: "women",
    tags: ["Wedding outfits", "Evening"],
    imageUrl:
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=480&h=720&fit=crop&q=80",
  },
  {
    _id: "mock-w-2",
    name: "Daytime Casual Knit",
    category: "shirts",
    gender: "women",
    tags: ["Casual wear", "Weekend"],
    imageUrl:
      "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=480&h=720&fit=crop&q=80",
  },
  {
    _id: "mock-w-3",
    name: "Pleated Midi Skirt",
    category: "skirts",
    gender: "women",
    tags: ["Office chic", "Looks"],
    imageUrl:
      "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=480&h=720&fit=crop&q=80",
  },
  {
    _id: "mock-w-4",
    name: "Strappy Evening Heels",
    category: "shoes",
    gender: "women",
    tags: ["Party", "Evening look"],
    imageUrl:
      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=480&h=720&fit=crop&q=80",
  },
];

export function getMockCatalogItems(gender) {
  if (gender === "women") return WOMEN.map((i) => ({ ...i }));
  return MEN.map((i) => ({ ...i }));
}
