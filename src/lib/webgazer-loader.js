export async function loadWebGazer() {
  return new Promise((resolve, reject) => {
    if (window.webgazer) return resolve(window.webgazer)

    const script = document.createElement("script")
    script.src = "https://webgazer.cs.brown.edu/webgazer.js"
    script.async = true
    script.onload = () => resolve(window.webgazer)
    script.onerror = reject
    document.body.appendChild(script)
  })
}
