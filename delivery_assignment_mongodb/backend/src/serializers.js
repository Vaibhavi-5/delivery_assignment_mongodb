// Shapes MongoDB documents into the exact JSON the frontend already expects.
const populateOrder = (q) =>
  q.populate({ path: "driver", populate: { path: "user", select: "username" } })
   .populate({ path: "customer", populate: { path: "user", select: "username" } });

const uname = (x) => (x && x.user && x.user.username) || null;

const orderCreated = (o) => ({
  id: o.order_no, road_area: o.road_area, items_summary: o.items_summary,
  status: o.status, created_at: o.created_at,
});

const orderCustomerView = (o) => ({
  id: o.order_no, road_area: o.road_area, items_summary: o.items_summary,
  status: o.status, driver_name: uname(o.driver),
  created_at: o.created_at, assigned_at: o.assigned_at, delivered_at: o.delivered_at,
});

const orderDriverView = (o) => ({
  id: o.order_no, customer_name: uname(o.customer),
  customer_phone: (o.customer && o.customer.phone) || "",
  road_area: o.road_area, items_summary: o.items_summary,
  status: o.status, assigned_at: o.assigned_at, delivered_at: o.delivered_at,
});

const orderManagerView = (o) => ({
  id: o.order_no, customer_name: uname(o.customer), road_area: o.road_area,
  items_summary: o.items_summary, status: o.status, driver_name: uname(o.driver),
  created_at: o.created_at, assigned_at: o.assigned_at, delivered_at: o.delivered_at,
});

const driverView = (d) => ({
  id: String(d._id),
  username: d.user ? d.user.username : null,
  name: d.user ? `${d.user.first_name || ""} ${d.user.last_name || ""}`.trim() : "",
  status: d.status,
  restaurant: d.restaurant ? String(d.restaurant) : null,
});

const restaurantView = (r) => ({ id: String(r._id), name: r.name, address: r.address, is_active: r.is_active });

module.exports = {
  populateOrder, orderCreated, orderCustomerView, orderDriverView,
  orderManagerView, driverView, restaurantView,
};
