from flask import Flask, render_template, request, jsonify

from recommend import (
    get_recommendations,
    get_unique_brands,
    get_laptop_by_id,
    get_variants_by_series,
    search_laptops,
)

try:
    from database import save_recommendation_history
except Exception:
    def save_recommendation_history(*args, **kwargs):
        pass

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Home + Recommendation entry point
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET", "POST"])
def index():
    brands = get_unique_brands()
    error  = None

    if request.method == "POST":
        # Collect form values — use 'os' key (matches name="os" in HTML)
        user_prefs = {
            "budget":    request.form.get("budget", type=float),
            "purpose":   request.form.get("purpose", ""),
            "brand":     request.form.get("brand", ""),
            "ram":       request.form.get("ram", type=int) if request.form.get("ram") else None,
            "processor": request.form.get("processor", ""),
            "storage":   request.form.get("storage", type=int) if request.form.get("storage") else None,
            "graphics":  request.form.get("graphics", ""),
            "screen":    request.form.get("screen", type=float) if request.form.get("screen") else None,
            "resolution": request.form.get("resolution", type=int) if request.form.get("resolution") else None,
            "os":        request.form.get("os", ""),
        }

        budget = user_prefs.get("budget")
        if not budget or budget < 10000:
            error = "Please enter a valid budget of at least ₹10,000."
            return render_template("index.html", brands=brands, error=error)

        try:
            results, best_match, best_value, best_performance = get_recommendations(user_prefs)
        except Exception as exc:
            app.logger.error(f"Recommendation error: {exc}", exc_info=True)
            error = "An unexpected error occurred while generating recommendations. Please try again."
            return render_template("index.html", brands=brands, error=error)

        if not results:
            error = (
                "No laptops found matching your criteria. "
                "Try relaxing your filters or increasing your budget."
            )
            return render_template("index.html", brands=brands, error=error)

        # Persist search history (silently skipped if DB unavailable)
        try:
            save_recommendation_history(user_prefs, [r["model_name"] for r in results])
        except Exception:
            pass

        return render_template(
            "result.html",
            recommendations=results,
            best_match=best_match,
            best_value=best_value,
            best_performance=best_performance,
            user_prefs=user_prefs,
        )

    return render_template("index.html", brands=brands, error=error)


# ---------------------------------------------------------------------------
# JSON API routes
# ---------------------------------------------------------------------------

@app.route("/laptop/<int:laptop_id>")
def laptop_detail(laptop_id):
    laptop = get_laptop_by_id(laptop_id)
    if laptop is None:
        return jsonify({"error": "Laptop not found"}), 404
    # If called from JS fetch (Accept: application/json) return JSON
    if request.headers.get("Accept", "").startswith("application/json") or \
       request.args.get("fmt") == "json":
        return jsonify(laptop)
    # Otherwise render a full detail page (e.g. clicked from home-page search)
    return render_template("laptop_detail.html", laptop=laptop)


@app.route("/variants/<path:model_series>")
def laptop_variants(model_series):
    variants = get_variants_by_series(model_series)
    return jsonify(variants)


@app.route("/search")
def search():
    query = request.args.get("q", "")
    results = search_laptops(query)
    return jsonify(results)


# ---------------------------------------------------------------------------
# Static pages
# ---------------------------------------------------------------------------

@app.route("/about")
def about():
    return render_template("about.html")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
