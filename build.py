#!/usr/bin/env python3
"""
Vohra's Store — static frontend builder.

Assembles src/partials + src/pages (+ one product template x 7 products) into dist/.
Each partial maps 1:1 to a future PHP include (templates/partials/*.php), and
src/data/products.json mirrors the future `products` table / API response.

Usage:  python3 build.py && npx tailwindcss -i src/css/input.css -o dist/assets/css/app.css --minify
"""
import json, re, shutil, html
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"
SITE = json.loads((SRC / "data/site.json").read_text())
PRODUCTS = json.loads((SRC / "data/products.json").read_text())
BY_SLUG = {p["slug"]: p for p in PRODUCTS}
PROFILES = {"classic": "Classic & Light", "spicy": "Spicy & Tangy", "creamy": "Creamy & Cheesy", "herby": "Fresh & Herby"}

# ---------------------------------------------------------------- icons (24px stroke set)
_I = {
    "cart": '<path d="M5 7h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    "user": '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h10"/>',
    "close": '<path d="M6 6l12 12M18 6 6 18"/>',
    "home": '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z"/>',
    "grid": '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "trash": '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    "check": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    "flame": '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.3 2.4-5.4 3.6-7.9.4 1.6 1.3 2.6 2.2 3 0-3 1.6-5.6 3.9-7 .1 3 2.8 5.3 2.8 9.7 0 4.3-2.4 8.3-6 8.3Z"/>',
    "leaf": '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-6 9-7.5"/>',
    "wheat-off": '<path d="M12 21V9M12 9c-2.5 0-4-1.8-4-4 2.5 0 4 1.8 4 4Zm0 0c2.5 0 4-1.8 4-4-2.5 0-4 1.8-4 4ZM12 14c-2.5 0-4-1.8-4-4M12 14c2.5 0 4-1.8 4-4"/><path d="M4 4l16 16"/>',
    "dumbbell": '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    "shield": '<path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5Z"/><path d="m9 12 2 2 4-4"/>',
    "truck": '<path d="M3 6.5h11v9H3zM14 10h3.8l3.2 3.2v2.3H14"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
    "pin": '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z"/><circle cx="12" cy="10" r="2.3"/>',
    "phone": '<path d="M6.6 3.5h2.6l1.4 4-2 1.4a12 12 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"/>',
    "mail": '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
    "box": '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z"/><path d="M4 7.5 12 11.5l8-4M12 11.5v9"/>',
    "gift": '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3-5-4-5-1.5S12 9 12 9Zm0 0c1.5-3 5-4 5-1.5S12 9 12 9Z"/>',
    "store": '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5c0 1.5 1.2 2.5 2.7 2.5S9.3 11 9.3 9.5c0 1.5 1.2 2.5 2.7 2.5s2.7-1 2.7-2.5c0 1.5 1.2 2.5 2.6 2.5S20 11 20 9.5M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
    "users": '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.9-3.1 3.2-4.6 6-4.6s5.1 1.5 6 4.6"/><path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.5 14.9c1.8.5 3 1.9 3.5 4.6"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    "tag": '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1 1 0 0 1 0 1.4l-7.8 7.8a1 1 0 0 1-1.4 0L3.5 12.3Z"/><circle cx="8" cy="8" r="1.4"/>',
    "chevron": '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "filter": '<path d="M4 6h16M7 12h10M10 18h4"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    "card": '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    "cash": '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
    "logout": '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l-4-4 4-4M6 12h10"/>',
    "edit": '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    "star": '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4Z"/>',
    "copy": '<rect x="8" y="8" width="11.5" height="11.5" rx="2"/><path d="M15.5 8V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5H8"/>',
}

def icon(name, cls="w-5 h-5"):
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{_I[name]}</svg>')

def esc(s): return html.escape(str(s), quote=True)

# ---------------------------------------------------------------- derived product facts
def highlights():
    out = {p["slug"]: [] for p in PRODUCTS}
    n = lambda p, k: p["nutrition"][k][0]
    top_p = max(PRODUCTS, key=lambda p: n(p, "protein"))
    top_f = max(PRODUCTS, key=lambda p: n(p, "fibre"))
    low_fat = min(n(p, "fat") for p in PRODUCTS)
    out[top_p["slug"]].append("Most protein")
    out[top_f["slug"]].append("Most fibre")
    for p in PRODUCTS:
        if n(p, "fat") == low_fat: out[p["slug"]].append("Lowest fat")
        if not p["allergens"]: out[p["slug"]].append("Peanut-free")
    return out
HL = highlights()

def fmt(v, unit):
    if v == 0: return f"0 {unit}"
    return f"{v:,.2f}".rstrip("0").rstrip(".") + f" {unit}"

# ---------------------------------------------------------------- generated snippets
def product_card(p, eager=False):
    nut = p["nutrition"]
    hl = HL[p["slug"]]
    badge = f'<span class="tag absolute z-10 left-3 top-3 bg-paper/90 text-ink border border-line">{esc(hl[0])}</span>' if hl else ""
    return f'''<article class="p-card group" style="--tint:{p["tint"]}" data-card data-slug="{p["slug"]}" data-name="{esc(p["name"])}" data-profile="{p["profile"]}" data-protein="{nut["protein"][0]}" data-energy="{nut["energy"][0]}" data-fat="{nut["fat"][0]}" data-fibre="{nut["fibre"][0]}" data-allergens="{",".join(p["allergens"]).lower() or "none"}">
  <a href="product-{p["slug"]}.html" class="p-card__stage relative block aspect-[4/5]" aria-label="{esc(p["name"])} Roasted Makhana">
    {badge}
    <img src="assets/img/products/{p["slug"]}.webp" alt="Vohra's {esc(p["name"])} roasted makhana, 100 g tin" width="358" height="750" {"" if eager else 'loading="lazy"'} decoding="async" class="absolute left-1/2 bottom-[7%] h-[84%] w-auto -translate-x-1/2 drop-shadow-[0_18px_18px_rgba(31,26,19,.28)] transition duration-500 group-hover:-translate-y-1 group-hover:rotate-[-2deg]">
  </a>
  <div class="flex flex-1 flex-col gap-1.5 p-3.5 sm:p-5">
    <p class="text-[10.5px] sm:text-[11px] uppercase tracking-[.18em] text-muted">Roasted Makhana · {p["weight"]}</p>
    <h3 class="text-[1.3rem] sm:text-[1.6rem] leading-tight"><a href="product-{p["slug"]}.html" class="hover:text-maroon">{esc(p["name"])}</a></h3>
    <p class="text-[13px] sm:text-sm text-muted leading-snug line-clamp-2">{esc(p["tagline"])}</p>
    <p class="text-[12px] text-muted num">{fmt(nut["protein"][0], "g")} protein · {nut["energy"][1]:g} kcal/serve</p>
    <div class="mt-auto flex items-center justify-between gap-2 pt-3">
      <p class="num"><span class="text-[1.15rem] font-semibold text-ink">₹{p["price"]}</span></p>
      <button type="button" class="btn-ink btn-sm !px-3.5 sm:!px-4" data-add="{p["slug"]}" aria-label="Add {esc(p["name"])} to cart">{icon("plus","w-4 h-4")}<span>Add</span></button>
    </div>
  </div>
</article>'''

def all_card():
    def row(items, cls):
        return f'<div class="flex items-end justify-center gap-[3%] {cls}">' + "".join(
            f'<img src="assets/img/products/{p["slug"]}.webp" alt="" width="358" height="750" loading="lazy" class="h-full w-auto drop-shadow-[0_8px_10px_rgba(0,0,0,.4)]">' for p in items) + '</div>'
    back, front = PRODUCTS[:3], PRODUCTS[3:]
    total = sum(p["price"] for p in PRODUCTS)
    return f'''<article class="p-card !bg-ink !border-ink text-cream" data-allcard>
  <div class="relative aspect-[4/5] overflow-hidden" style="background:radial-gradient(90% 70% at 50% 100%, rgba(201,138,27,.5), transparent 70%)">
    <span class="absolute left-3 top-3 z-10 tag bg-gold text-ink">Tasting set</span>
    {row(back, "absolute inset-x-0 top-[17%] h-[40%] opacity-90")}
    {row(front, "absolute inset-x-0 bottom-[7%] h-[42%]")}
  </div>
  <div class="flex flex-1 flex-col gap-1.5 p-3.5 sm:p-5">
    <p class="text-[10.5px] sm:text-[11px] uppercase tracking-[.18em] text-cream/60">7 tins · 700 g</p>
    <h3 class="text-[1.3rem] sm:text-[1.6rem] leading-tight !text-cream">Can't pick one?</h3>
    <p class="text-[13px] sm:text-sm text-cream/70 leading-snug">One tin of every flavour, added in a single tap.</p>
    <div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
      <p class="num"><span class="text-[1.15rem] font-semibold">₹{total:,}</span></p>
      <button type="button" class="btn-gold btn-sm !px-3.5 sm:!px-4" data-add-all>{icon("plus","w-4 h-4")}<span>Add all</span></button>
    </div>
  </div>
</article>'''

def flavour_rail():
    items = []
    for p in PRODUCTS:
        items.append(f'''<a href="product-{p["slug"]}.html" class="group snap-start shrink-0 w-[132px] sm:w-[150px] text-center">
  <span class="relative mx-auto grid place-items-center w-[112px] h-[112px] sm:w-[128px] sm:h-[128px] rounded-full transition group-hover:scale-[1.04]" style="background:{p["tint"]}">
    <img src="assets/img/bowls/{p["slug"]}.webp" alt="" width="200" height="180" loading="lazy" class="w-[86%] h-auto drop-shadow-[0_10px_10px_rgba(31,26,19,.2)]">
  </span>
  <span class="mt-3 block font-display text-[1.15rem] leading-tight text-ink group-hover:text-maroon">{esc(p["name"])}</span>
</a>''')
    return "\n".join(items)

def nav_flavours():
    return "\n".join(
        f'<a href="product-{p["slug"]}.html" class="flex items-center gap-3 py-2 text-[15px] text-ink hover:text-maroon"><span class="w-3 h-3 rounded-full shrink-0" style="background:{p["color"]}"></span>{esc(p["name"])}</a>'
        for p in PRODUCTS)

def footer_flavours():
    return "\n".join(f'<li><a href="product-{p["slug"]}.html" class="hover:text-gold">{esc(p["name"])}</a></li>' for p in PRODUCTS)

def nutrition_compare_rows():
    """Server-rendered rows for the home-page comparison; JS only switches the metric."""
    rows = []
    for p in PRODUCTS:
        n = p["nutrition"]
        rows.append(f'''<li class="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] sm:grid-cols-[11rem_1fr_5.5rem] items-center gap-3" data-row data-protein="{n["protein"][0]}" data-energy="{n["energy"][0]}" data-fat="{n["fat"][0]}" data-fibre="{n["fibre"][0]}" data-sodium="{n["sodium"][0]}">
  <a href="product-{p["slug"]}.html" class="truncate text-[14px] sm:text-[15px] text-ink hover:text-maroon">{esc(p["name"])}</a>
  <div class="bar-track"><div class="bar-fill" style="background:{p["color"]};width:0%"></div></div>
  <span class="num text-right text-[13.5px] font-medium text-ink" data-val></span>
</li>''')
    return "\n".join(rows)

NUT_LABELS = [("energy", "Energy", "kcal"), ("protein", "Protein", "g"), ("carbs", "Carbohydrates", "g"),
              ("sugar", "Total sugar", "g"), ("addedSugar", "Added sugar", "g"), ("fat", "Total fat", "g"),
              ("satFat", "Saturated fat", "g"), ("transFat", "Trans fat", "g"), ("cholesterol", "Cholesterol", "mg"),
              ("sodium", "Sodium", "mg"), ("fibre", "Dietary fibre", "g")]

def nutrition_table(p):
    rows = []
    for k, label, unit in NUT_LABELS:
        a, b, r = p["nutrition"][k]
        rows.append(f'<tr class="border-t border-line"><th scope="row" class="py-2.5 pr-3 text-left font-normal text-ink">{label}</th>'
                    f'<td class="py-2.5 px-3 text-right num">{fmt(a, unit)}</td><td class="py-2.5 px-3 text-right num">{fmt(b, unit)}</td>'
                    f'<td class="py-2.5 pl-3 text-right num text-muted">{r}</td></tr>')
    return "\n".join(rows)

def allergen_block(p):
    if p["allergens"]:
        chips = "".join(f'<span class="tag bg-gold-soft text-maroon !text-[13px] !px-3 !py-1">{a}</span>' for a in p["allergens"])
        return f'<div class="flex flex-wrap gap-2">{chips}</div><p class="mt-3 text-[14px] text-muted">Contains {", ".join(p["allergens"])}. Produced in a facility where tree nuts and dairy may be present.</p>'
    return '<p class="text-[14px] text-muted">No declared allergens in the recipe. Produced in a facility where tree nuts and dairy may be present.</p>'

def related(p):
    others = [o for o in PRODUCTS if o["slug"] != p["slug"]]
    same = [o for o in others if o["profile"] == p["profile"]]
    pick = (same + [o for o in others if o not in same])[:4]
    return "\n".join(product_card(o) for o in pick)

def thumbs(p):
    imgs = [("products", "Tin"), ("bowls", "In the bowl"), ("labels", "Label")]
    return "\n".join(
        f'<button type="button" class="shrink-0 w-[68px] h-[68px] sm:w-20 sm:h-20 rounded-xl border-2 {"border-ink" if i == 0 else "border-transparent"} bg-paper p-1.5 transition hover:border-gold" data-thumb="assets/img/{d}/{p["slug"]}.webp" aria-label="Show {lab.lower()} image"><img src="assets/img/{d}/{p["slug"]}.webp" alt="" class="w-full h-full object-contain" loading="lazy"></button>'
        for i, (d, lab) in enumerate(imgs))

# ---------------------------------------------------------------- assembly
PARTIALS = {f.stem: f.read_text() for f in (SRC / "partials").glob("*.html")}

def fill(tpl, ctx):
    tpl = re.sub(r"\{\{icon:([\w-]+)(?:\|([^}]+))?\}\}", lambda m: icon(m.group(1), m.group(2) or "w-5 h-5"), tpl)
    def rep(m):
        k = m.group(1)
        if k in ctx: return str(ctx[k])
        if k in SITE: return esc(SITE[k])
        raise KeyError(f"Unknown placeholder {{{{{k}}}}}")
    return re.sub(r"\{\{([\w.]+)\}\}", rep, tpl)

def render_page(body, meta):
    ctx = dict(meta)
    ctx.setdefault("body_class", "")
    ctx.update({
        "product_cards": "\n".join(product_card(p, eager=i < 4) for i, p in enumerate(PRODUCTS)),
        "flavour_rail": flavour_rail(), "nav_flavours": nav_flavours(), "footer_flavours": footer_flavours(),
        "compare_rows": nutrition_compare_rows(), "product_count": len(PRODUCTS),
        "all_price": f'₹{sum(p["price"] for p in PRODUCTS):,}', "all_card": all_card(),
    })
    ctx["canonical"] = f'https://{SITE["domain"]}/{meta["file"] if meta["file"] != "index.html" else ""}'
    shell = PARTIALS["layout"].replace("<!--HEADER-->", PARTIALS["header"]).replace("<!--FOOTER-->", PARTIALS["footer"]).replace("<!--BODY-->", body)
    out = fill(shell, ctx)
    page = meta.get("page", "")
    out = re.sub(r'data-nav="%s"' % re.escape(page), f'data-nav="{page}" aria-current="page"', out) if page else out
    return out

def main():
    if DIST.exists(): shutil.rmtree(DIST)
    shutil.copytree(SRC / "assets", DIST / "assets")
    (DIST / "assets/js").mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC / "js/app.js", DIST / "assets/js/app.js")

    # Product feed for the browser-side demo cart (becomes GET /api/products later)
    feed = [{k: p[k] for k in ("slug", "name", "tagline", "price", "mrp", "weight", "color", "tint", "profile")} for p in PRODUCTS]
    cfg = {k: SITE[k] for k in ("shipping", "coupons", "company")}
    (DIST / "assets/js/products.js").write_text(
        "/* Generated by build.py from src/data/products.json — replaced by the PHP API in the dynamic build. */\n"
        f"window.VOHRA_PRODUCTS = {json.dumps(feed, ensure_ascii=False)};\nwindow.VOHRA_CONFIG = {json.dumps(cfg, ensure_ascii=False)};\n")

    count = 0
    for f in sorted((SRC / "pages").glob("*.html")):
        raw = f.read_text()
        m = re.match(r"\s*<!--meta\s+(\{.*?\})\s*-->\s*", raw, re.S)
        meta = json.loads(m.group(1)); meta["file"] = f.name
        (DIST / f.name).write_text(render_page(raw[m.end():], meta)); count += 1

    tpl = (SRC / "templates/product.html").read_text()
    for p in PRODUCTS:
        n = p["nutrition"]
        meta = {"file": f'product-{p["slug"]}.html', "page": "shop",
                "title": f'{p["name"]} Roasted Makhana 100 g', "desc": f'{p["tagline"]}. {p["description"][:110]}',
                "body_class": "has-buybar"}
        ctx = {
            "p_slug": p["slug"], "p_name": esc(p["name"]), "p_tagline": esc(p["tagline"]), "p_desc": esc(p["description"]),
            "p_price": p["price"], "p_mrp": p["mrp"], "p_weight": p["weight"], "p_tint": p["tint"], "p_color": p["color"],
            "p_profile": PROFILES[p["profile"]], "p_profile_key": p["profile"],
            "p_protein": fmt(n["protein"][0], "g"), "p_energy_serve": f'{n["energy"][1]:g}', "p_fibre": fmt(n["fibre"][0], "g"),
            "p_fat": fmt(n["fat"][0], "g"),
            "p_ingredients": esc(p["ingredients"]), "p_nutrition_rows": nutrition_table(p), "p_allergens": allergen_block(p),
            "p_highlights": "".join(f'<span class="tag bg-paper border border-line text-ink">{esc(h)}</span>' for h in HL[p["slug"]]),
            "p_thumbs": thumbs(p), "p_related": related(p),
            "p_prop1": p["props"][0], "p_prop2": p["props"][1],
            "p_jsonld": json.dumps({"@context": "https://schema.org", "@type": "Product", "name": f'Vohra\'s {p["name"]} Roasted Makhana',
                                    "image": f'https://{SITE["domain"]}/assets/img/products/{p["slug"]}.webp', "description": p["description"],
                                    "brand": {"@type": "Brand", "name": "Vohra's"}, "weight": p["weight"],
                                    "offers": {"@type": "Offer", "priceCurrency": "INR", "price": p["price"], "availability": "https://schema.org/InStock",
                                               "url": f'https://{SITE["domain"]}/product-{p["slug"]}.html'}}, ensure_ascii=False),
        }
        body = fill(tpl, ctx)
        (DIST / meta["file"]).write_text(render_page(body, meta)); count += 1

    # SEO helpers
    urls = [f.name for f in sorted(DIST.glob("*.html")) if f.name not in ("404.html", "order-success.html", "account.html", "cart.html", "checkout.html")]
    (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f'  <url><loc>https://{SITE["domain"]}/{"" if u == "index.html" else u}</loc></url>\n' for u in urls) + "</urlset>\n")
    (DIST / "robots.txt").write_text(f"User-agent: *\nDisallow: /cart.html\nDisallow: /checkout.html\nDisallow: /account.html\nSitemap: https://{SITE['domain']}/sitemap.xml\n")
    print(f"Built {count} pages into {DIST}")

if __name__ == "__main__":
    main()
