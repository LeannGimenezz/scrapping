const express = require('express');
const { chromium } = require('playwright');
// const fs = require('fs'); // Ya no es necesario para el endpoint, a menos que quieras guardar localmente además de responder

const app = express();
const PORT = process.env.PORT || 3000; // Puerto configurable, default 3000

// La función de scraping, adaptada para ser llamada y retornar datos
async function scrapePencyDisglutenfree() {
  console.log('Iniciando scraping...');
  const browser = await chromium.launch({
    headless: true, // RECOMENDADO para servidores. Cambia a false para depurar localmente.
    args: [
      '--no-sandbox', // Necesario para muchos entornos de despliegue (Docker, etc.)
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Evita problemas con memoria compartida limitada
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      // '--single-process', // Desaconsejado en general, pero a veces necesario
      '--disable-gpu'
    ]
  });
  const page = await browser.newPage();
  const data = [];

  try {
    console.log('Navegando a https://pency.app/disglutenfree');
    await page.goto('https://pency.app/disglutenfree', { waitUntil: 'networkidle', timeout: 60000 }); // Esperar a que la red esté más tranquila

    try {
      console.log('Intentando cerrar modal...');
      // Aumentar timeout y ser más específico si es posible
      await page.waitForSelector('button[data-test-id="product-onboarding-close"]', { timeout: 5000 });
      await page.click('button[data-test-id="product-onboarding-close"]');
      console.log('Modal cerrado correctamente.');
    } catch (e) {
      console.log('No apareció el modal o no se pudo cerrar, continuando...');
    }

    console.log('Haciendo scroll para cargar contenido...');
    // Scroll más robusto para lazy loading
    let previousHeight;
    for (let i = 0; i < 10; i++) { // Intentar scrollear varias veces
        previousHeight = await page.evaluate('document.body.scrollHeight');
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await page.waitForTimeout(1500); // Esperar a que cargue el contenido
        let newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === previousHeight) break; // Si no hay más scroll, salir
    }
    // O el original si funciona bien:
    // await page.waitForTimeout(100);
    // await page.mouse.wheel(0, 15000); // Un poco más de scroll
    // await page.waitForTimeout(2000); // Más tiempo para cargar después del scroll

    console.log('Buscando contenedores de categoría...');
    const categoryContainers = await page.$$('.css-a6fk9l, .css-xyh1ff');
    console.log(`Se encontraron ${categoryContainers.length} contenedores de categoría.`);

    for (let i = 0; i < categoryContainers.length; i++) {
      const container = categoryContainers[i];
      const categoriaData = { categoria: `Categoría Desconocida ${i + 1}`, productos: [] };

      try {
        const tituloCategoriaElement = await container.$('p.css-18v1jhz');
        if (tituloCategoriaElement) {
          categoriaData.categoria = await tituloCategoriaElement.innerText();
        }

        const svgIcon = await container.$('svg.feather-chevron-down');
        if (svgIcon) {
          console.log(`Intentando expandir categoría: "${categoriaData.categoria}"`);
          await svgIcon.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200); // Pequeña pausa antes de clickear
          await svgIcon.click();
          console.log(`Categoría "${categoriaData.categoria}" clickeada para expandir.`);
          await page.waitForTimeout(1000); // Esperar a que los productos aparezcan

          // Volver a seleccionar los productos DESPUÉS de expandir la categoría,
          // idealmente dentro del contexto del contenedor de la categoría actual si es posible.
          // Esta selección es global, podría ser un problema si la estructura es muy anidada.
          // Si '.css-xxs8cq' es el selector de producto DENTRO de la categoría expandida,
          // podrías hacer `container.$$('.css-xxs8cq')` si la estructura lo permite.
          // Por ahora, mantenemos la lógica original de buscar productos globalmente tras el click.
          // Si las categorías no se "colapsan" al abrir otra, esto podría funcionar.
          // Si se colapsan, necesitarías raspar productos *inmediatamente* después de expandir *esta* categoría.

        } else {
          console.log(`No se encontró el ícono para expandir en "${categoriaData.categoria}".`);
          // Si no hay ícono, quizás los productos ya están visibles o es una categoría sin sub-elementos clickeables.
        }

        // Recolectar productos para ESTA categoría (o los visibles en ese momento)
        // Es importante que el selector '.css-xxs8cq' sea para productos *dentro* de la categoría expandida
        // o que los productos se carguen de forma que sean distinguibles.
        // Para ser más robusto, sería mejor hacer:
        // const productosElements = await container.$$('.css-xxs8cq');
        // Pero si los productos no están anidados directamente bajo 'container', la selección global es necesaria.

        // Asumimos que los productos cargados son los de la última categoría expandida
        // ESTO ES UNA ASUNCIÓN CRÍTICA. Si varias categorías se abren y los productos
        // no se cargan de forma aislada por categoría, esto mezclará productos.
        // Una mejora sería hacer `await container.$$('.css-xxs8cq')` si los productos están anidados.
        const productosElements = await page.$$('.css-xxs8cq');
        console.log(`→ Se encontraron ${productosElements.length} elementos de producto tras interactuar con "${categoriaData.categoria}"`);
        const productosCategoria = [];

        for (const productoEl of productosElements) {
          const contenedorInfo = await productoEl.$('.css-1nqnvtt');
          if (!contenedorInfo) continue;

          const ps = await contenedorInfo.$$('p');
          const nombre = ps[0] ? await ps[0].innerText() : 'Sin nombre';
          const descripcion = ps[1] ? await ps[1].innerText() : 'Sin descripción';

          const precioElement = await productoEl.$('p.css-lb7l61');
          const precio = precioElement ? await precioElement.innerText() : 'Sin precio';

          let stock = 'No especificado';
          const stockDisponible = await productoEl.$('p.css-11cvmn9');
          const sinStock = await productoEl.$('.css-a8b72n'); // p.css-a8b72n según tu script original

          if (stockDisponible) {
            stock = await stockDisponible.innerText();
          } else if (sinStock) {
            stock = 'Sin stock';
          } else {
            // Podría haber un estado intermedio o simplemente estar disponible sin texto específico
            stock = 'Stock disponible (o no indicado explícitamente)';
          }

          // Lógica de imagen (aún comentada como en tu original)
          // let imagen = 'Sin imagen';
          // const posiblesDivsImagen = await productoEl.$$('div[style*="background-image"]'); // Ejemplo
          // if (posiblesDivsImagen.length > 0) {
          //    const style = await posiblesDivsImagen[0].getAttribute('style');
          //    const match = style.match(/url\("?(.*?)"?\)/);
          //    if (match && match[1]) imagen = match[1];
          // }

          productosCategoria.push({
            nombre,
            descripcion,
            precio,
            stock
            // imagen
          });
        }
        categoriaData.productos = productosCategoria;


      } catch (err) {
        console.error(`Error procesando la categoría "${categoriaData.categoria}":`, err.message);
        // Continuar con la siguiente categoría
      }
      data.push(categoriaData); // Agrega la categoría y sus productos (o un array vacío si falló)
      // console.log(JSON.stringify(categoriaData, null, 2)); // Log por categoría
    }

  } catch (error) {
    console.error('Error durante el proceso de scraping:', error);
    // Propagar el error para que el endpoint pueda devolver un 500
    await browser.close(); // Asegurar que el navegador se cierre en caso de error
    throw error;
  }

  console.log('Cerrando el navegador.');
  await browser.close();
  console.log('Scraping completado. Datos recolectados:', data.length, "categorías");
  return data;
}

// Endpoint GET para ejecutar el scraping
app.get('/scrape-pency', async (req, res) => {
  try {
    console.log('Solicitud recibida en /scrape-pency');
    const scrapedData = await scrapePencyDisglutenfree();

    // Opcional: Guardar en archivo si aún lo necesitas
    /*
    const baseName = 'productos_scraped';
    const extension = '.json';
    let filename = `${baseName}${extension}`;
    fs.writeFileSync(filename, JSON.stringify(scrapedData, null, 2));
    console.log(`Archivo "${filename}" guardado localmente.`);
    */

    res.json(scrapedData);
  } catch (error) {
    console.error("Error en el endpoint /scrape-pency:", error);
    res.status(500).json({
      error: 'Falló el scraping.',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('Servidor de scraping funcionando. Prueba el endpoint /scrape-pency');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
      console.log(`Prueba el endpoint en: http://localhost:${PORT}/scrape-pency`);
  }
});