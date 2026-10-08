(function () {
  "use strict";

  var STORAGE_KEY = "dhiti_analytics_consent";
  var banner;

  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function writeChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function updateConsent(value) {
    var granted = value === "granted";
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: granted ? "granted" : "denied",
      functionality_storage: "granted",
      security_storage: "granted"
    });
    writeChoice(value);
    window.dataLayer.push({
      event: "analytics_consent_update",
      analytics_consent: granted ? "granted" : "denied"
    });
    if (banner) banner.remove();
    banner = null;
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement("section");
    banner.className = "dh-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Analytics cookie preferences");
    banner.innerHTML =
      '<div class="dh-consent-copy">' +
        '<strong>Your privacy, your choice.</strong>' +
        '<p>We use optional analytics cookies to understand how this website is used and improve it. We do not use advertising cookies.</p>' +
        '<a href="/privacy/">Read our privacy notice</a>' +
      '</div>' +
      '<div class="dh-consent-actions">' +
        '<button type="button" class="dh-consent-reject">Reject optional cookies</button>' +
        '<button type="button" class="dh-consent-accept">Accept analytics</button>' +
      '</div>';
    document.body.appendChild(banner);
    banner.querySelector(".dh-consent-reject").addEventListener("click", function () { updateConsent("denied"); });
    banner.querySelector(".dh-consent-accept").addEventListener("click", function () { updateConsent("granted"); });
  }

  function trackLinkClick(anchor) {
    var href = anchor.getAttribute("href") || "";
    var eventName = "";
    if (href.indexOf("mailto:") === 0) eventName = "email_click";
    else if (href.indexOf("tel:") === 0) eventName = "phone_click";
    else if (/wa\.me|whatsapp\.com/i.test(href)) eventName = "whatsapp_click";
    else if (/tidycal\.com|calendly\.com/i.test(href)) eventName = "book_meeting_click";
    else if (/\.(pdf|docx?|xlsx?|pptx?|zip)(\?|#|$)/i.test(href)) eventName = "file_download";
    if (!eventName) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      link_url: href,
      link_text: (anchor.textContent || "").trim().slice(0, 100)
    });
  }

  document.addEventListener("click", function (event) {
    var settings = event.target.closest("[data-cookie-settings]");
    if (settings) {
      event.preventDefault();
      showBanner();
      return;
    }
    var anchor = event.target.closest("a[href]");
    if (anchor) trackLinkClick(anchor);
  });

  function init() {
    var queryRequestsSettings = /(?:\?|&)cookie-settings=1(?:&|$)/.test(window.location.search);
    if (!readChoice() || queryRequestsSettings) showBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
