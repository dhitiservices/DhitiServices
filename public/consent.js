(function () {
  "use strict";

  var STORAGE_KEY = "dhiti_analytics_consent";

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
    updateStatus();
  }

  function updateStatus() {
    var status = document.querySelector("[data-consent-status]");
    if (!status) return;
    status.textContent = readChoice() === "denied" ? "Disabled on this browser." : "Enabled on this browser.";
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
    var choice = event.target.closest("[data-analytics-choice]");
    if (choice) {
      updateConsent(choice.getAttribute("data-analytics-choice"));
      return;
    }
    var anchor = event.target.closest("a[href]");
    if (anchor) trackLinkClick(anchor);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateStatus);
  else updateStatus();
})();
