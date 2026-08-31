// Curated, accurate food & grocery photographic imagery tailored for Kenyan culinary culture
// Ensures dish photos show prepared meals, while raw ingredients show authentic market produce.

export interface FoodVisual {
  name: string;
  category: string;
  imageUrl: string;
  emoji: string;
  color: string;
}

// Non-food shopping-list categories must never resolve to a food photo — a
// household/cleaning/personal-care/utilities item shows this neutral,
// locally-generated placeholder instead of, say, a potato or rice image.
// An inline SVG data URI rather than another stock photo: it can never
// 404/break, and it doesn't imply visual accuracy for a specific product it
// isn't verified to depict (spec: "never force a food image onto a
// non-food item").
export const NON_FOOD_PLACEHOLDER_IMAGE =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23EDE9E1%22%2F%3E%3Cg%20stroke%3D%22%239B9284%22%20stroke-width%3D%2210%22%20fill%3D%22none%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M110%20150%20L110%20310%20L290%20310%20L290%20150%20Z%22%2F%3E%3Cpath%20d%3D%22M110%20150%20L150%2090%20L250%2090%20L290%20150%22%2F%3E%3Cline%20x1%3D%22150%22%20y1%3D%22150%22%20x2%3D%22150%22%20y2%3D%22205%22%2F%3E%3Cline%20x1%3D%22250%22%20y1%3D%22150%22%20x2%3D%22250%22%20y2%3D%22205%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E';

const NON_FOOD_SHOPPING_CATEGORIES = new Set(['household', 'cleaning', 'personal_care', 'utilities']);

export const KENYAN_FOOD_IMAGES: Record<string, string> = {
  // --- INGREDIENTS: STAPLES & FLOUR ---
  'Maize Flour (Unga ya Ugali)': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Maize Flour (Unga)': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Maize Flour': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Unga wa Mahindi': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Unga': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Wheat Flour (Unga ya Ngano)': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Wheat Flour': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Unga wa Ngano': 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=400&q=80',
  'Gram Flour (Besan)': 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?auto=format&fit=crop&w=400&q=80',
  'Wimbi / Millet Porridge Flour': 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?auto=format&fit=crop&w=400&q=80',
  'Wimbi Flour': 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?auto=format&fit=crop&w=400&q=80',
  'Rolled Oats': 'https://images.unsplash.com/photo-1510776478953-fa4dc5de04ca?auto=format&fit=crop&w=400&q=80',
  'Yeast/Baking Powder': 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?auto=format&fit=crop&w=400&q=80',
  'Bread': 'https://images.unsplash.com/photo-1552056413-b8b5eed0170b?auto=format&fit=crop&w=400&q=80',
  'Bread slices': 'https://images.unsplash.com/photo-1552056413-b8b5eed0170b?auto=format&fit=crop&w=400&q=80',
  'Wholemeal / White Bread': 'https://images.unsplash.com/photo-1552056413-b8b5eed0170b?auto=format&fit=crop&w=400&q=80',

  // --- INGREDIENTS: GRAINS & RICE ---
  'Pishori Rice (Mwea)': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
  'Pishori Rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
  'Sindano White Rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
  'White Rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
  'Rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
  'Mchele': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',

  // --- INGREDIENTS: TUBERS & ROOTS ---
  'Irish Potatoes (Waru)': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  'Irish Potatoes': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  'Potatoes': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  'Waru': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  'Viazi Mviringo': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400&q=80',
  'Sweet Potatoes (Ngwaci)': 'https://images.unsplash.com/photo-1730815048561-45df6f7f331d?auto=format&fit=crop&w=400&q=80',
  'Sweet Potatoes': 'https://images.unsplash.com/photo-1730815048561-45df6f7f331d?auto=format&fit=crop&w=400&q=80',
  'Ngwaci': 'https://images.unsplash.com/photo-1730815048561-45df6f7f331d?auto=format&fit=crop&w=400&q=80',
  'Arrowroots (Nduma)': 'https://images.unsplash.com/photo-1757283961544-e161ac41b201?auto=format&fit=crop&w=400&q=80',
  'Nduma': 'https://images.unsplash.com/photo-1757283961544-e161ac41b201?auto=format&fit=crop&w=400&q=80',
  'Cooking Bananas (Matoke)': 'https://images.unsplash.com/photo-1747940340427-8784f54c4ad9?auto=format&fit=crop&w=400&q=80',
  'Green Bananas (Matoke)': 'https://images.unsplash.com/photo-1747940340427-8784f54c4ad9?auto=format&fit=crop&w=400&q=80',
  'Matoke': 'https://images.unsplash.com/photo-1747940340427-8784f54c4ad9?auto=format&fit=crop&w=400&q=80',

  // --- INGREDIENTS: FRESH VEGETABLES & GREENS ---
  'Sukuma Wiki': 'https://images.unsplash.com/photo-1524179091875-bf99a9a6af57?auto=format&fit=crop&w=400&q=80',
  'Sukuma': 'https://images.unsplash.com/photo-1524179091875-bf99a9a6af57?auto=format&fit=crop&w=400&q=80',
  'Sukuma Wiki (Mama Mboga)': 'https://images.unsplash.com/photo-1524179091875-bf99a9a6af57?auto=format&fit=crop&w=400&q=80',
  'Spinach': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=400&q=80',
  'Cabbage': 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?auto=format&fit=crop&w=400&q=80',
  'Managu (African Nightshade)': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Managu': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Terere (Amaranth Leaves)': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Terere': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Cowpea Leaves (Kunde)': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Jute Mallow (Mrere / Mrenda)': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Kunde Greens': 'https://plus.unsplash.com/premium_photo-1725623987682-a39ad9cc40de?auto=format&fit=crop&w=400&q=80',
  'Fresh Minji (Green Peas)': 'https://images.unsplash.com/photo-1531857475897-48f2102b7566?auto=format&fit=crop&w=400&q=80',
  'Minji': 'https://images.unsplash.com/photo-1531857475897-48f2102b7566?auto=format&fit=crop&w=400&q=80',
  'Green Peas': 'https://images.unsplash.com/photo-1531857475897-48f2102b7566?auto=format&fit=crop&w=400&q=80',
  'Fresh Green Maize Cobs': 'https://images.unsplash.com/photo-1757332914764-ca5a484c5fe1?auto=format&fit=crop&w=400&q=80',
  'Carrots': 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=400&q=80',
  'Ripe Tomatoes': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'Tomatoes': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'Nyanya': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'Red Onions': 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=400&q=80',
  'Onions': 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=400&q=80',
  'Kitunguu Maji': 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=400&q=80',
  'Fresh Tomatoes & Onions': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'Onions, Tomatoes & Dhania': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'Fresh Coriander (Dhania)': 'https://images.unsplash.com/photo-1723810330043-dd05647294cb?auto=format&fit=crop&w=400&q=80',
  'Dhania': 'https://images.unsplash.com/photo-1723810330043-dd05647294cb?auto=format&fit=crop&w=400&q=80',
  'Green Bell Peppers (Pilipili Hoho)': 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=400&q=80',
  'Garlic & Ginger Root (Kitunguu Saumu & Tangawizi)': 'https://images.unsplash.com/photo-1758738880738-8f662ac47e4f?auto=format&fit=crop&w=400&q=80',

  // --- INGREDIENTS: FRUITS ---
  'Hass / Fuerte Avocado': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
  'Avocado': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
  'Parachichi': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
  'Sweet Bananas (Ndizi Mbivu)': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=400&q=80',
  'Sweet Bananas': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=400&q=80',
  'Ripe Mangoes (Apple/Ngowe)': 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=400&q=80',
  'Ripe Papaya (Pawpaw)': 'https://images.unsplash.com/photo-1552427085-45d07c9e950d?auto=format&fit=crop&w=400&q=80',
  'Sweet Pineapple': 'https://images.unsplash.com/photo-1498336679134-06092db0d1c8?auto=format&fit=crop&w=400&q=80',
  'Sweet Oranges': 'https://images.unsplash.com/photo-1702393210319-b534bd48f3aa?auto=format&fit=crop&w=400&q=80',
  'Purple Passion Fruits': 'https://plus.unsplash.com/premium_photo-1722691370600-18315542e96c?auto=format&fit=crop&w=400&q=80',

  // --- INGREDIENTS: PROTEINS, MEATS & LEGUMES ---
  'Beef (Butchery)': 'https://images.unsplash.com/photo-1690983323238-0b91789e1b5a?auto=format&fit=crop&w=400&q=80',
  'Beef (Nyama ya Ng\'ombe)': 'https://images.unsplash.com/photo-1690983323238-0b91789e1b5a?auto=format&fit=crop&w=400&q=80',
  'Beef': 'https://images.unsplash.com/photo-1690983323238-0b91789e1b5a?auto=format&fit=crop&w=400&q=80',
  'Nyama ya Ng\'ombe': 'https://images.unsplash.com/photo-1690983323238-0b91789e1b5a?auto=format&fit=crop&w=400&q=80',
  'Goat Meat (Nyama ya Mbuzi)': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
  'Chicken (Kuku)': 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=400&q=80',
  'Kienyeji Chicken': 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=400&q=80',
  'Kuku': 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=400&q=80',
  'Omena': 'https://images.unsplash.com/photo-1758827986233-6c0259b54fb1?auto=format&fit=crop&w=400&q=80',
  'Tilapia Fish': 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=400&q=80',
  'Eggs': 'https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&w=400&q=80',
  'Mayai': 'https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?auto=format&fit=crop&w=400&q=80',
  'Yellow Beans': 'https://images.unsplash.com/photo-1724418020207-144b3ba54d2d?auto=format&fit=crop&w=400&q=80',
  'Boiled Yellow Beans': 'https://images.unsplash.com/photo-1724418020207-144b3ba54d2d?auto=format&fit=crop&w=400&q=80',
  'Maharage ya Njano': 'https://images.unsplash.com/photo-1724418020207-144b3ba54d2d?auto=format&fit=crop&w=400&q=80',
  'Green Maize & Bean Mix (Githeri)': 'https://images.unsplash.com/photo-1724418020207-144b3ba54d2d?auto=format&fit=crop&w=400&q=80',
  'Ndengu (Green Grams)': 'https://images.unsplash.com/photo-1577110563838-e408b455c91d?auto=format&fit=crop&w=400&q=80',
  'Ndengu': 'https://images.unsplash.com/photo-1577110563838-e408b455c91d?auto=format&fit=crop&w=400&q=80',
  'Kamande (Lentils)': 'https://images.unsplash.com/photo-1763368392508-3d4bddfdd20a?auto=format&fit=crop&w=400&q=80',
  'Brown Lentils (Kamande)': 'https://images.unsplash.com/photo-1763368392508-3d4bddfdd20a?auto=format&fit=crop&w=400&q=80',
  'Crushed Groundnuts': 'https://images.unsplash.com/photo-1552329822-b1e325719181?auto=format&fit=crop&w=400&q=80',
  'Crushed Peanuts (Njugu)': 'https://images.unsplash.com/photo-1552329822-b1e325719181?auto=format&fit=crop&w=400&q=80',
  'Raw / Roasted Groundnuts (Njugu Karanga)': 'https://images.unsplash.com/photo-1552329822-b1e325719181?auto=format&fit=crop&w=400&q=80',
  'Raw Groundnuts': 'https://images.unsplash.com/photo-1552329822-b1e325719181?auto=format&fit=crop&w=400&q=80',
  'Roasted Groundnuts (crushed)': 'https://images.unsplash.com/photo-1552329822-b1e325719181?auto=format&fit=crop&w=400&q=80',
  'Roasted Peanuts & Honey drizzle': 'https://images.unsplash.com/photo-1552329822-b1e325719181?auto=format&fit=crop&w=400&q=80',

  // --- INGREDIENTS: DAIRY & PANTRY ---
  'Fresh Whole Milk': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
  'Milk': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
  'Maziwa': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
  'Mala (Fermented Milk)': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
  'Vegetable Cooking Oil': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
  'Cooking Oil': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
  'Mafuta ya Kupikia': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
  'Tea Leaves': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80',
  'Iodized Table Salt': 'https://images.unsplash.com/photo-1769259362714-d442db54b706?auto=format&fit=crop&w=400&q=80',
  'Salt': 'https://images.unsplash.com/photo-1769259362714-d442db54b706?auto=format&fit=crop&w=400&q=80',
  'Sugar & Cardamom': 'https://images.unsplash.com/photo-1769259362714-d442db54b706?auto=format&fit=crop&w=400&q=80',
  'Sugar/Honey': 'https://images.unsplash.com/photo-1769259362714-d442db54b706?auto=format&fit=crop&w=400&q=80',
  'Royco Mchuzi Mix Seasoning': 'https://plus.unsplash.com/premium_photo-1726862790171-0d6208559224?auto=format&fit=crop&w=400&q=80',
  'Turmeric & Chili Powder': 'https://plus.unsplash.com/premium_photo-1726862790171-0d6208559224?auto=format&fit=crop&w=400&q=80',
  'Lemon & Honey/Sugar': 'https://images.unsplash.com/photo-1717439062391-1c2932e1c051?auto=format&fit=crop&w=400&q=80',
  'Lemon, Red Chili, Salt': 'https://images.unsplash.com/photo-1717439062391-1c2932e1c051?auto=format&fit=crop&w=400&q=80',
  'Lime & Chili Flakes': 'https://images.unsplash.com/photo-1717439062391-1c2932e1c051?auto=format&fit=crop&w=400&q=80',

  // --- PREPARED KENYAN DISHES ---
  'Ugali with Sukuma Wiki & Fried Eggs': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
  'Ugali with Sukuma Wiki & Yellow Beans Stew': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
  'Ugali with Wet Fry Beef & Traditional Greens': 'https://images.unsplash.com/photo-1547496502-affa22d38842?auto=format&fit=crop&w=600&q=80',
  'Ugali with Sukuma Wiki & Beef Stew': 'https://images.unsplash.com/photo-1547496502-affa22d38842?auto=format&fit=crop&w=600&q=80',
  'Steamed Rice with Coconut Ndengu Stew & Kachumbari': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
  'Soft Layered Chapati with Madondo (Bean Stew)': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
  'Githeri Special with Potatoes, Carrots & Avocado': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
  'Githeri Special (Maize & Beans with Potatoes & Greens)': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
  'Matoke (Plantain) & Beef One-Pot Stew': 'https://images.unsplash.com/photo-1547496502-affa22d38842?auto=format&fit=crop&w=600&q=80',
  'Matoke (Green Bananas Stewed with Beef & Carrots)': 'https://images.unsplash.com/photo-1547496502-affa22d38842?auto=format&fit=crop&w=600&q=80',
  'Matoke Simmered with Green Grams (Ndengu) & Spinach': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
  'Ugali with Crispy Omena Fry & Traditional Managu': 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=600&q=80',
  'Fried Omena with Ugali & Traditional Greens': 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=600&q=80',
  'Whole Fried Tilapia with Ugali & Kachumbari': 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
  'Aromatic Swahili Beef Pilau with Kachumbari & Banana': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
  'Kenyan Beef Pilau with Kachumbari': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
  'Fermented Wimbi Porridge with Boiled Sweet Potatoes & Eggs': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
  'Boiled Nduma (Arrowroots) with Spiced Kenyan Chai & Eggs': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
  'Mukimo (Irio) with Rich Beef Stew & Gravy': 'https://images.unsplash.com/photo-1547496502-affa22d38842?auto=format&fit=crop&w=600&q=80',
  'Mukimo with Traditional Beef Stew': 'https://images.unsplash.com/photo-1547496502-affa22d38842?auto=format&fit=crop&w=600&q=80',
  'Kienyeji Chicken Stew with Ugali & Managu': 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=600&q=80',
  'White Rice with Tender Beef Stew & Steamed Cabbage': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
  'Chips Mayai (Zege / Potato Omelette) with Kachumbari': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
  'Layered Chapati with Kamande (Brown Lentil Stew)': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
  'Warm Milk Rolled Oats with Bananas & Crushed Peanuts': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
  'Steamed Rice with Minji (Green Peas), Carrots & Potatoes': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
  'Kenyan Rolex (Chapati Rolled with Veggie Omelette)': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
  'Ugali with Sautéed Terere (Amaranth) & Poached Eggs': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
  'Swahili Chicken Biryani with Spiced Rice & Boiled Eggs': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
  'Kenyan Boiled Egg Sandwich (Mayai Pasua) with Kachumbari': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
  'Kenyan Chai & Mandazi': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
  'Spiced Milk Tea (Chai ya Maziwa) with Boiled Eggs': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',

  // --- BUDGET & EXPENSE CATEGORIES ---
  'Food': 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
  'Groceries': 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
  'food': 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
  'Butchery / Meat': 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=400&q=80',
  'Mama Mboga': 'https://images.unsplash.com/photo-1524179091875-bf99a9a6af57?auto=format&fit=crop&w=400&q=80',
  'Rent': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80',
  'rent': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80',
  'Transport': 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=400&q=80',
  'transport': 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=400&q=80',
  'Bills': 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=400&q=80',
  'bills': 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=400&q=80',
  'Electricity / KPLC': 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=400&q=80',
  'utilities': 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=400&q=80',
  'Shopping': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=80',
  'Savings': 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=400&q=80',
  'savings': 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=400&q=80',
  'Health': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
  'health': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
  'Entertainment': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
  'entertainment': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
  'Debt': 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
  'Other': 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=400&q=80',
};

/**
 * Intelligent Image Resolution with Hierarchical Matching:
 * 1. Exact string match
 * 2. Full prepared dish match (prevents dish names like "Mukimo with Beef" from resolving to raw butcher meat)
 * 3. Specific ingredient keywords
 * 4. Category fallback
 */
export const getFoodImageUrl = (nameOrKey: string, categoryFallback?: string): string => {
  if (!nameOrKey) return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';

  const cleanName = nameOrKey.trim();

  // A caller that already knows this is a non-food shopping item (household/
  // cleaning/personal_care/utilities) short-circuits straight to the neutral
  // placeholder — never attempts a food-keyword match that could
  // accidentally hit (e.g. "Water" as in bottled water vs. the "water" bill
  // keyword below), and never falls through to a food photo.
  if (categoryFallback && NON_FOOD_SHOPPING_CATEGORIES.has(categoryFallback)) {
    return NON_FOOD_PLACEHOLDER_IMAGE;
  }

  const cleanLower = cleanName.toLowerCase();
  if (/(toilet paper|toilet tissue|bathroom tissue|\btissue\b|paper towel|sanitary|\bbatter(y|ies)\b|light bulb|laundry detergent|washing powder|dishwashing|dish soap|cleaning sponge|\bbleach\b|floor cleaner|\bsoap\b|toothpaste|toothbrush|cooking gas|gas cylinder|\bcharcoal\b|\bmakaa\b|\bmatches\b)/.test(cleanLower)) {
    return NON_FOOD_PLACEHOLDER_IMAGE;
  }

  // 1. Direct Dictionary Match
  if (KENYAN_FOOD_IMAGES[cleanName]) {
    return KENYAN_FOOD_IMAGES[cleanName];
  }

  const lower = cleanName.toLowerCase();

  // 2. DISH-LEVEL MATCHES FIRST (Strictly before generic words like 'beef' or 'rice')
  if (lower.includes('pilau')) {
    return KENYAN_FOOD_IMAGES['Aromatic Swahili Beef Pilau with Kachumbari & Banana'];
  }
  if (lower.includes('biryani')) {
    return KENYAN_FOOD_IMAGES['Swahili Chicken Biryani with Spiced Rice & Boiled Eggs'];
  }
  if (lower.includes('mukimo') || lower.includes('irio')) {
    return KENYAN_FOOD_IMAGES['Mukimo (Irio) with Rich Beef Stew & Gravy'];
  }
  if (lower.includes('matoke') && (lower.includes('stew') || lower.includes('beef') || lower.includes('ndengu') || lower.includes('one-pot'))) {
    return KENYAN_FOOD_IMAGES['Matoke (Plantain) & Beef One-Pot Stew'];
  }
  if (lower.includes('githeri')) {
    return KENYAN_FOOD_IMAGES['Githeri Special (Maize & Beans with Potatoes & Greens)'];
  }
  if (lower.includes('chips mayai') || lower.includes('zege')) {
    return KENYAN_FOOD_IMAGES['Chips Mayai (Zege / Potato Omelette) with Kachumbari'];
  }
  if (lower.includes('rolex')) {
    return KENYAN_FOOD_IMAGES['Kenyan Rolex (Chapati Rolled with Veggie Omelette)'];
  }
  if (lower.includes('madondo') || (lower.includes('chapati') && lower.includes('bean'))) {
    return KENYAN_FOOD_IMAGES['Soft Layered Chapati with Madondo (Bean Stew)'];
  }
  if (lower.includes('chapati') && (lower.includes('kamande') || lower.includes('ndengu') || lower.includes('lentil'))) {
    return KENYAN_FOOD_IMAGES['Layered Chapati with Kamande (Brown Lentil Stew)'];
  }
  if (lower.includes('chapati') || lower.includes('chapo')) {
    return KENYAN_FOOD_IMAGES['Soft Layered Chapati with Madondo (Bean Stew)'];
  }
  if (lower.includes('mandazi') || lower.includes('mahamri')) {
    return KENYAN_FOOD_IMAGES['Kenyan Chai & Mandazi'];
  }
  if (lower.includes('uji') || lower.includes('wimbi porridge') || lower.includes('porridge')) {
    return KENYAN_FOOD_IMAGES['Fermented Wimbi Porridge with Boiled Sweet Potatoes & Eggs'];
  }
  if (lower.includes('oats')) {
    return KENYAN_FOOD_IMAGES['Warm Milk Rolled Oats with Bananas & Crushed Peanuts'];
  }
  if (lower.includes('nduma') && lower.includes('chai')) {
    return KENYAN_FOOD_IMAGES['Boiled Nduma (Arrowroots) with Spiced Kenyan Chai & Eggs'];
  }
  if (lower.includes('mayai pasua') || (lower.includes('boiled egg') && lower.includes('kachumbari'))) {
    return KENYAN_FOOD_IMAGES['Kenyan Boiled Egg Sandwich (Mayai Pasua) with Kachumbari'];
  }
  if (lower.includes('tilapia') || (lower.includes('samaki') && lower.includes('fry'))) {
    return KENYAN_FOOD_IMAGES['Whole Fried Tilapia with Ugali & Kachumbari'];
  }
  if (lower.includes('omena') && (lower.includes('fry') || lower.includes('ugali'))) {
    return KENYAN_FOOD_IMAGES['Ugali with Crispy Omena Fry & Traditional Managu'];
  }
  if (lower.includes('ugali') && lower.includes('sukuma') && lower.includes('egg')) {
    return KENYAN_FOOD_IMAGES['Ugali with Sukuma Wiki & Fried Eggs'];
  }
  if (lower.includes('ugali') && lower.includes('sukuma') && lower.includes('bean')) {
    return KENYAN_FOOD_IMAGES['Ugali with Sukuma Wiki & Yellow Beans Stew'];
  }
  if (lower.includes('ugali') && (lower.includes('beef') || lower.includes('nyama') || lower.includes('stew') || lower.includes('wet fry'))) {
    return KENYAN_FOOD_IMAGES['Ugali with Wet Fry Beef & Traditional Greens'];
  }
  if (lower.includes('ugali') && (lower.includes('terere') || lower.includes('managu'))) {
    return KENYAN_FOOD_IMAGES['Ugali with Sautéed Terere (Amaranth) & Poached Eggs'];
  }
  if (lower.includes('rice') && lower.includes('ndengu')) {
    return KENYAN_FOOD_IMAGES['Steamed Rice with Coconut Ndengu Stew & Kachumbari'];
  }
  if (lower.includes('rice') && lower.includes('minji')) {
    return KENYAN_FOOD_IMAGES['Steamed Rice with Minji (Green Peas), Carrots & Potatoes'];
  }
  if (lower.includes('rice') && (lower.includes('beef') || lower.includes('cabbage') || lower.includes('stew'))) {
    return KENYAN_FOOD_IMAGES['White Rice with Tender Beef Stew & Steamed Cabbage'];
  }

  // 3. INGREDIENTS & RAW PRODUCE
  if (lower.includes('sukuma') || lower.includes('collard')) {
    return KENYAN_FOOD_IMAGES['Sukuma Wiki'];
  }
  if (lower.includes('unga') || lower.includes('maize flour') || lower.includes('cornmeal')) {
    return KENYAN_FOOD_IMAGES['Maize Flour (Unga ya Ugali)'];
  }
  if (lower.includes('wheat flour') || lower.includes('unga ya ngano')) {
    return KENYAN_FOOD_IMAGES['Wheat Flour (Unga ya Ngano)'];
  }
  if (lower.includes('pishori') || lower.includes('sindano') || lower.includes('mchele') || lower.includes('rice')) {
    return KENYAN_FOOD_IMAGES['Pishori Rice (Mwea)'];
  }
  if (lower.includes('waru') || lower.includes('irish potato') || lower.includes('potato')) {
    return KENYAN_FOOD_IMAGES['Irish Potatoes (Waru)'];
  }
  if (lower.includes('ngwaci') || lower.includes('sweet potato')) {
    return KENYAN_FOOD_IMAGES['Sweet Potatoes (Ngwaci)'];
  }
  if (lower.includes('nduma') || lower.includes('arrowroot')) {
    return KENYAN_FOOD_IMAGES['Arrowroots (Nduma)'];
  }
  if (lower.includes('matoke') || lower.includes('green banana')) {
    return KENYAN_FOOD_IMAGES['Cooking Bananas (Matoke)'];
  }
  if (lower.includes('spinach')) {
    return KENYAN_FOOD_IMAGES['Spinach'];
  }
  if (lower.includes('cabbage') || lower.includes('kabeji')) {
    return KENYAN_FOOD_IMAGES['Cabbage'];
  }
  if (lower.includes('managu') || lower.includes('terere') || lower.includes('kienyeji green') || lower.includes('kunde') || lower.includes('mrere') || lower.includes('mrenda') || lower.includes('jute mallow') || lower.includes('cowpea leaves')) {
    return KENYAN_FOOD_IMAGES['Managu (African Nightshade)'];
  }
  if (lower.includes('maize cob') || lower.includes('green maize') || lower.includes('mahindi mbichi')) {
    return KENYAN_FOOD_IMAGES['Fresh Green Maize Cobs'];
  }
  if (lower.includes('gram flour') || lower.includes('besan')) {
    return KENYAN_FOOD_IMAGES['Gram Flour (Besan)'];
  }
  if (lower.includes('groundnut') || lower.includes('peanut') || lower.includes('njugu')) {
    return KENYAN_FOOD_IMAGES['Crushed Groundnuts'];
  }
  if (lower.includes('bread')) {
    return KENYAN_FOOD_IMAGES['Bread'];
  }
  if (lower.includes('papaya') || lower.includes('pawpaw')) {
    return KENYAN_FOOD_IMAGES['Ripe Papaya (Pawpaw)'];
  }
  if (lower.includes('pineapple') || lower.includes('nanasi')) {
    return KENYAN_FOOD_IMAGES['Sweet Pineapple'];
  }
  if (lower.includes('orange') || lower.includes('chungwa')) {
    return KENYAN_FOOD_IMAGES['Sweet Oranges'];
  }
  if (lower.includes('passion fruit') || lower.includes('passionfruit') || lower.includes('karakara')) {
    return KENYAN_FOOD_IMAGES['Purple Passion Fruits'];
  }
  if (lower.includes('lemon') || lower.includes('lime') || lower.includes('ndimu')) {
    return KENYAN_FOOD_IMAGES['Lemon & Honey/Sugar'];
  }
  if (lower.includes('minji') || lower.includes('green peas') || lower.includes('njegere')) {
    return KENYAN_FOOD_IMAGES['Fresh Minji (Green Peas)'];
  }
  if (lower.includes('carrot') || lower.includes('karoti')) {
    return KENYAN_FOOD_IMAGES['Carrots'];
  }
  if (lower.includes('nyanya') || lower.includes('tomato')) {
    return KENYAN_FOOD_IMAGES['Ripe Tomatoes'];
  }
  if (lower.includes('kitunguu') || lower.includes('onion')) {
    return KENYAN_FOOD_IMAGES['Red Onions'];
  }
  if (lower.includes('dhania') || lower.includes('coriander') || lower.includes('cilantro')) {
    return KENYAN_FOOD_IMAGES['Fresh Coriander (Dhania)'];
  }
  if (lower.includes('hoho') || lower.includes('bell pepper') || lower.includes('capsicum')) {
    return KENYAN_FOOD_IMAGES['Green Bell Peppers (Pilipili Hoho)'];
  }
  if (lower.includes('garlic') || lower.includes('ginger') || lower.includes('saumu') || lower.includes('tangawizi')) {
    return KENYAN_FOOD_IMAGES['Garlic & Ginger Root (Kitunguu Saumu & Tangawizi)'];
  }
  if (lower.includes('avocado') || lower.includes('parachichi')) {
    return KENYAN_FOOD_IMAGES['Hass / Fuerte Avocado'];
  }
  if (lower.includes('mango') || lower.includes('embe') || lower.includes('maembe')) {
    return KENYAN_FOOD_IMAGES['Ripe Mangoes (Apple/Ngowe)'];
  }
  if (lower.includes('banana') || lower.includes('ndizi')) {
    return KENYAN_FOOD_IMAGES['Sweet Bananas (Ndizi Mbivu)'];
  }
  if (lower.includes('beef') || lower.includes('ng\'ombe') || lower.includes('butchery')) {
    return KENYAN_FOOD_IMAGES['Beef (Butchery)'];
  }
  if (lower.includes('mbuzi') || lower.includes('goat')) {
    return KENYAN_FOOD_IMAGES['Goat Meat (Nyama ya Mbuzi)'];
  }
  if (lower.includes('chicken') || lower.includes('kuku')) {
    return KENYAN_FOOD_IMAGES['Chicken (Kuku)'];
  }
  if (lower.includes('omena')) {
    return KENYAN_FOOD_IMAGES['Omena'];
  }
  if (lower.includes('tilapia') || lower.includes('fish') || lower.includes('samaki')) {
    return KENYAN_FOOD_IMAGES['Tilapia Fish'];
  }
  if (lower.includes('egg') || lower.includes('mayai')) {
    return KENYAN_FOOD_IMAGES['Eggs'];
  }
  if (lower.includes('yellow bean') || lower.includes('wairimu') || lower.includes('kidney bean') || lower.includes('maharage') || lower.includes('bean')) {
    return KENYAN_FOOD_IMAGES['Yellow Beans'];
  }
  if (lower.includes('ndengu') || lower.includes('green gram') || lower.includes('mung')) {
    return KENYAN_FOOD_IMAGES['Ndengu (Green Grams)'];
  }
  if (lower.includes('milk') || lower.includes('maziwa') || lower.includes('mala')) {
    return KENYAN_FOOD_IMAGES['Fresh Whole Milk'];
  }
  if (lower.includes('oil') || lower.includes('mafuta')) {
    return KENYAN_FOOD_IMAGES['Vegetable Cooking Oil'];
  }
  if (lower.includes('tea') || lower.includes('chai')) {
    return KENYAN_FOOD_IMAGES['Tea Leaves'];
  }
  if (lower.includes('salt') || lower.includes('chumvi')) {
    return KENYAN_FOOD_IMAGES['Salt'];
  }
  if (lower.includes('turmeric') || lower.includes('manjano')) {
    return KENYAN_FOOD_IMAGES['Turmeric & Chili Powder'];
  }
  if (lower.includes('royco') || lower.includes('mchuzi mix') || lower.includes('seasoning')) {
    return KENYAN_FOOD_IMAGES['Royco Mchuzi Mix Seasoning'];
  }
  if (lower.includes('sugar') || lower.includes('sukari')) {
    return KENYAN_FOOD_IMAGES['Sugar/Honey'];
  }
  if (lower.includes('yeast') || lower.includes('baking powder')) {
    return KENYAN_FOOD_IMAGES['Yeast/Baking Powder'];
  }

  // 4. FINANCIAL & EXPENSE CATEGORIES
  if (lower.includes('rent') || lower.includes('house') || lower.includes('landlord')) {
    return KENYAN_FOOD_IMAGES['Rent'];
  }
  if (lower.includes('transport') || lower.includes('matatu') || lower.includes('fare') || lower.includes('fuel') || lower.includes('bodaboda') || lower.includes('uber')) {
    return KENYAN_FOOD_IMAGES['Transport'];
  }
  if (lower.includes('kplc') || lower.includes('token') || lower.includes('electricity') || lower.includes('water') || lower.includes('utility') || lower.includes('bill')) {
    return KENYAN_FOOD_IMAGES['Electricity / KPLC'];
  }
  if (lower.includes('saving') || lower.includes('sacco') || lower.includes('chama') || lower.includes('m-shwari')) {
    return KENYAN_FOOD_IMAGES['Savings'];
  }
  if (lower.includes('health') || lower.includes('hospital') || lower.includes('daktari') || lower.includes('chemist') || lower.includes('pharmacy')) {
    return KENYAN_FOOD_IMAGES['Health'];
  }
  if (lower.includes('entertainment') || lower.includes('outing') || lower.includes('leisure')) {
    return KENYAN_FOOD_IMAGES['Entertainment'];
  }
  if (lower.includes('grocer') || lower.includes('market') || lower.includes('supermarket')) {
    return KENYAN_FOOD_IMAGES['Food'];
  }

  // 5. Category Fallback
  if (categoryFallback && KENYAN_FOOD_IMAGES[categoryFallback]) {
    return KENYAN_FOOD_IMAGES[categoryFallback];
  }

  return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
};
