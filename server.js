const express = require('express');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

async function scrapePencyDisglutenfree() {
  console.log('Iniciando scraping...');
  let browser;

  try {
    browser = await chromium.launch({
      headless: true, // Cambia a false para depuración local y ver el navegador
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      // Puedes añadir un user-agent más común si es necesario
      // userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
      viewport: { width: 1280, height: 1024 } // Un viewport razonable
    });
    const page = await context.newPage();
    const data = [];

    console.log('Navegando a https://pency.app/disglutenfree');
    await page.goto('https://pency.app/disglutenfree', {
      waitUntil: 'networkidle',
      timeout: 90000,
    });

    // Manejo del modal de bienvenida
    try {
      console.log('Intentando cerrar modal de bienvenida...');
      const modalCloseButton = 'button[data-test-id="product-onboarding-close"]';
      await page.waitForSelector(modalCloseButton, { timeout: 10000 }); // Aumentamos un poco la espera
      await page.click(modalCloseButton);
      console.log('Modal de bienvenida cerrado correctamente.');
    } catch (e) {
      console.log('No apareció el modal de bienvenida o no se pudo cerrar, continuando...');
    }

    // Scroll mejorado para cargar todo el contenido (lazy loading)
    console.log('Realizando scroll para cargar todo el contenido...');
    let previousHeight;
    for (let i = 0; i < 20; i++) { // Aumentar un poco el número de intentos de scroll
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(2000 + Math.random() * 1000); // Espera entre 2 y 3 segundos
      let newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === previousHeight) {
        console.log('Scroll completado, no más contenido cargado.');
        break;
      }
      console.log(`Scroll ${i + 1}, altura previa: ${previousHeight}, altura nueva: ${newHeight}`);
      if (i === 19) console.log('Se alcanzó el límite de intentos de scroll.');
    }

    console.log('Buscando contenedores de categoría...');
    // Esperar un poco a que los contenedores se estabilicen después del scroll
    await page.waitForTimeout(1000);
    const categoryContainers = await page.$$('.css-a6fk9l, .css-xyh1ff');
    console.log(`Se encontraron ${categoryContainers.length} contenedores de categoría.`);

    for (let i = 0; i < categoryContainers.length; i++) {
      const container = categoryContainers[i];
      let nombreCategoria = `Categoría Desconocida ${i + 1}`;

      try {
        const tituloCategoriaElement = await container.$('p.css-18v1jhz');
        if (tituloCategoriaElement) {
          nombreCategoria = await tituloCategoriaElement.innerText();
        }
        console.log(`Procesando categoría (${i+1}/${categoryContainers.length}): "${nombreCategoria}"`);

        const svgIcon = await container.$('svg.feather-chevron-down');
        if (svgIcon) {
          console.log(`Intentando expandir categoría: "${nombreCategoria}"`);
          await svgIcon.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500 + Math.random() * 500); // Pausa antes del click

          // --- INICIO DE LA LÓGICA DE CLICK MEJORADA ---
          try {
            // Intenta primero un click normal con un timeout razonable
            console.log(`   Intentando click normal en SVG de "${nombreCategoria}"...`);
            await svgIcon.click({ timeout: 15000 }); // Aumentar un poco el timeout para el click normal
            console.log(`   ✓ Click normal en SVG de "${nombreCategoria}" exitoso.`);
          } catch (clickError) {
            console.warn(`   ⚠️ Click normal en SVG de "${nombreCategoria}" falló: ${clickError.message.split('\n')[0]}`); // Mensaje más corto
            console.log(`   Intentando click con JavaScript en SVG de "${nombreCategoria}" como fallback...`);
            try {
                await svgIcon.evaluate(node => node.click());
                console.log(`   ✓ Click con JavaScript en SVG de "${nombreCategoria}" exitoso.`);
            } catch (jsClickError) {
                console.error(`   ❌ Click con JavaScript en SVG de "${nombreCategoria}" TAMBIÉN FALLÓ: ${jsClickError.message}`);
                // Si ambos fallan, podríamos forzarlo, o simplemente loguear y continuar
                // await svgIcon.click({ force: true, timeout: 5000 });
                // console.log(`   Intentando click forzado tras fallo de JS...`);
                throw jsClickError; // Relanzar el error si el click JS falla para que se capture en el catch de la categoría
            }
          }
          // --- FIN DE LA LÓGICA DE CLICK MEJORADA ---

          console.log(`Categoría "${nombreCategoria}" interacción de expansión completada.`);
          // Esperar a que los productos se carguen/actualicen después de expandir
          await page.waitForTimeout(2000 + Math.random() * 1500); // Aumentar ligeramente esta espera
        } else {
          console.log(`No se encontró el ícono para expandir en "${nombreCategoria}". Productos podrían estar ya visibles o ser una categoría sin expansión.`);
        }

        // Lógica para recolectar productos de la categoría actual
        // IMPORTANTE: Esta parte asume que los productos .css-xxs8cq que aparecen son los de la categoría
        // recién interactuada. Si no es así, se necesitaría una lógica más sofisticada
        // para aislar los productos de *esta* categoría (ej. usando container.locator(...))
        const productosElements = await page.$$('.css-xxs8cq');
        console.log(`→ Buscando productos en página tras interactuar con "${nombreCategoria}". Encontrados globalmente: ${productosElements.length}`);
        const productosCategoria = [];

        for (const productoEl of productosElements) {
          // Podrías añadir una comprobación aquí para ver si el productoEl está realmente DENTRO del 'container' actual,
          // si la estructura HTML lo permite y si la selección global de productos es demasiado amplia.
          // Ejemplo: const isDescendant = await productoEl.evaluate((el, catContainer) => catContainer.contains(el), container);
          // if (!isDescendant) continue;

          const contenedorInfo = await productoEl.$('.css-1nqnvtt');
          if (!contenedorInfo) {
            // console.log("Producto omitido: No se encontró .css-1nqnvtt");
            continue;
          }

          const ps = await contenedorInfo.$$('p');
          const nombre = ps[0] ? (await ps[0].innerText()).trim() : 'Sin nombre';
          const descripcion = ps[1] ? (await ps[1].innerText()).trim() : 'Sin descripción';

          const precioElement = await productoEl.$('p.css-lb7l61');
          const precio = precioElement ? (await precioElement.innerText()).trim() : 'Sin precio';

          let stock = 'No especificado';
          const stockDisponible = await productoEl.$('p.css-11cvmn9'); // Texto como "XX unidades disponibles"
          const sinStockElement = await productoEl.$('p.css-a8b72n');    // Texto como "Sin stock"

          if (stockDisponible) {
            stock = (await stockDisponible.innerText()).trim();
          } else if (sinStockElement) {
            const sinStockText = (await sinStockElement.innerText()).trim();
            if (sinStockText.toLowerCase().includes('sin stock') || sinStockText.toLowerCase().includes('agotado')) {
              stock = 'Sin stock';
            } else {
              stock = sinStockText; // Usar el texto tal cual si no es "Sin stock"
              console.log(`   Texto de stock no reconocido en .css-a8b72n para "${nombre}": "${stock}"`);
            }
          } else {
            stock = 'Stock disponible (implícito)';
          }

          let imagen = 'Sin imagen';
          // Intenta buscar un div con background-image (ejemplo, ajustar selector)
          const divImagen = await productoEl.$('div[style*="background-image"]');
          if (divImagen) {
            const style = await divImagen.getAttribute('style');
            if (style) {
                const match = style.match(/url\("?(.*?)"?\)/);
                if (match && match[1]) {
                    imagen = match[1];
                }
            }
          } else {
            // O intenta buscar una etiqueta img (ejemplo, ajustar selector)
            const imgTag = await productoEl.$('img');
            if (imgTag) {
                imagen = await imgTag.getAttribute('src') || 'Src no encontrado en img';
            }
          }


          productosCategoria.push({
            nombre,
            descripcion,
            precio,
            stock,
            imagen,
          });
        }

        if (productosCategoria.length > 0) {
            data.push({
              categoria: nombreCategoria,
              productos: productosCategoria,
            });
            console.log(`✓ Categoría "${nombreCategoria}" procesada con ${productosCategoria.length} productos.`);
        } else {
            console.log(`⚠️ No se encontraron productos para la categoría "${nombreCategoria}" con los selectores actuales, o la lógica de asociación falló.`);
            // Opcional: añadir entrada vacía para saber que se intentó
            data.push({
                categoria: nombreCategoria,
                productos: [],
                nota: "No se encontraron productos o fallo en asociación"
            });
        }

      } catch (err) {
        console.error(`❌ Error procesando la categoría "${nombreCategoria}" (índice ${i}):`, err.message, err.stack.substring(0, 300));
        data.push({
          categoria: nombreCategoria,
          productos: [],
          error: `Error al procesar: ${err.message}`,
        });
      }
    } // FIN DEL BUCLE DE CATEGORÍAS

    console.log('Scraping principal completado.');
    return data;

  } catch (error) {
    console.error('Error general durante el proceso de scraping:', error);
    throw error;
  } finally {
    if (browser) {
      console.log('Cerrando el navegador.');
      await browser.close();
    }
  }
}

// Endpoint GET para ejecutar el scraping
app.get('/api/scrapping', async (req, res) => {
  try {
    console.log(`Solicitud recibida en ${req.path}`);
    const scrapedData = await scrapePencyDisglutenfree();

    if (scrapedData && scrapedData.length > 0) {
        res.json(scrapedData);
    } else {
        console.log("No se devolvieron datos o los datos estaban vacíos.");
        res.status(404).json({ message: "No se encontraron datos o el scraping no produjo resultados." });
    }

  } catch (error) {
    if (!res.headersSent) {
      console.error(`Error en el endpoint ${req.path}:`, error.message);
      res.status(500).json({
        error: 'Falló el scraping.',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
});

app.get('/', (req, res) => {
  res.send(`Servidor de scraping funcionando. Accede a /api/scrapping para obtener los datos.`);
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Prueba el endpoint de scraping en: http://localhost:${PORT}/api/scrapping`);
  }
});