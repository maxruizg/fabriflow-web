/**
 * CSF Reader - Lee el código QR de una Constancia de Situación Fiscal (PDF)
 * y extrae la información del contribuyente.
 *
 * Este módulo solo funciona en el cliente (browser) debido a las dependencias de DOM.
 */

export interface CSFData {
  rfc: string;
  nombre: string;
  codigoPostal?: string;
  regimen?: string;
  rawUrl?: string;
}

export interface CSFReaderResult {
  success: boolean;
  data?: CSFData;
  error?: string;
}

/**
 * Lee un archivo PDF de CSF y extrae los datos del código QR
 * Solo funciona en el navegador (client-side)
 */
export async function readCSFFromPDF(file: File): Promise<CSFReaderResult> {
  // Verificar que estamos en el cliente
  if (typeof window === 'undefined') {
    return { success: false, error: 'Esta función solo está disponible en el navegador' };
  }

  try {
    // Importar dinámicamente las librerías solo cuando se necesitan
    const [pdfjsLib, jsQRModule] = await Promise.all([
      import('pdfjs-dist'),
      import('jsqr')
    ]);

    const jsQR = jsQRModule.default;

    // Configurar el worker de PDF.js usando unpkg CDN con URL completa
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    // Leer el archivo como ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Cargar el PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Obtener la primera página
    const page = await pdf.getPage(1);

    // Configurar el canvas para renderizar
    const scale = 2; // Mayor escala = mejor calidad para leer QR
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return { success: false, error: 'No se pudo crear el contexto del canvas' };
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Renderizar la página en el canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    // Obtener los datos de la imagen
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Buscar el código QR en la imagen completa
    let qrCode = jsQR(imageData.data, imageData.width, imageData.height);

    // Si no se encuentra, intentar con secciones de la imagen (el QR suele estar en esquinas)
    if (!qrCode) {
      // Intentar con la esquina superior derecha (donde suele estar el QR en CSF)
      const regions = [
        { x: canvas.width * 0.6, y: 0, w: canvas.width * 0.4, h: canvas.height * 0.4 }, // Superior derecha
        { x: 0, y: 0, w: canvas.width * 0.4, h: canvas.height * 0.4 }, // Superior izquierda
        { x: canvas.width * 0.6, y: canvas.height * 0.6, w: canvas.width * 0.4, h: canvas.height * 0.4 }, // Inferior derecha
        { x: 0, y: canvas.height * 0.6, w: canvas.width * 0.4, h: canvas.height * 0.4 }, // Inferior izquierda
      ];

      for (const region of regions) {
        const regionData = context.getImageData(region.x, region.y, region.w, region.h);
        qrCode = jsQR(regionData.data, regionData.width, regionData.height);
        if (qrCode) break;
      }
    }

    if (!qrCode) {
      return { success: false, error: 'No se encontró código QR en el documento' };
    }

    // Parsear los datos del QR
    const parsedData = parseCSFQRData(qrCode.data);

    if (!parsedData) {
      return { success: false, error: 'No se pudo interpretar el código QR. Asegúrate de subir una CSF válida del SAT.' };
    }

    return { success: true, data: parsedData };

  } catch (error) {
    console.error('Error reading CSF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al procesar el PDF'
    };
  }
}

/**
 * Parsea los datos del código QR de la CSF
 * El QR del SAT contiene una URL con los datos fiscales
 * Formato típico: https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?...
 */
function parseCSFQRData(qrData: string): CSFData | null {
  try {
    console.log('QR Data:', qrData);

    // El QR puede contener una URL del SAT o datos directos
    // Intentar parsear como URL primero
    if (qrData.includes('sat.gob.mx') || qrData.includes('http')) {
      return parseCSFUrl(qrData);
    }

    // Si no es URL, intentar parsear como texto estructurado
    return parseCSFText(qrData);

  } catch (error) {
    console.error('Error parsing QR data:', error);
    return null;
  }
}

/**
 * Parsea una URL del SAT que contiene los datos fiscales
 * Formatos conocidos:
 * 1. https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=RFC_NOMBRE_CP
 * 2. URL con parámetros directos: ?rfc=XXX&nombre=YYY
 */
function parseCSFUrl(url: string): CSFData | null {
  try {
    console.log('Parsing URL:', url);
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // Formato 1: Parámetros directos
    let rfc = params.get('rfc') || params.get('RFC') || params.get('id') || '';
    let nombre = params.get('nombre') || params.get('NOMBRE') || params.get('re') || '';
    const cp = params.get('cp') || params.get('CP') || '';
    const regimen = params.get('regimen') || params.get('REGIMEN') || '';

    // Formato 2: SAT usa D1, D2, D3 donde D3 contiene los datos separados por _
    const d3 = params.get('D3');
    if (d3 && !rfc) {
      console.log('Parsing D3 parameter:', d3);
      // D3 típicamente contiene: RFC_NOMBRE_CP o similar
      const parts = d3.split('_');
      if (parts.length >= 1) {
        // El primer elemento suele ser el RFC
        const possibleRfc = parts[0];
        if (possibleRfc.match(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i)) {
          rfc = possibleRfc;
          // El resto podría ser el nombre
          if (parts.length >= 2) {
            nombre = parts.slice(1).join(' ').replace(/_/g, ' ');
          }
        }
      }
    }

    // Si encontramos el RFC, consideramos válido
    if (rfc) {
      console.log('Found RFC:', rfc, 'Nombre:', nombre);
      return {
        rfc: rfc.toUpperCase(),
        nombre: decodeURIComponent(nombre).toUpperCase(),
        codigoPostal: cp,
        regimen: regimen,
        rawUrl: url,
      };
    }

    // Intentar extraer RFC de cualquier parte de la URL
    const rfcMatch = url.match(/([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);
    if (rfcMatch) {
      console.log('Found RFC in URL:', rfcMatch[1]);
      return {
        rfc: rfcMatch[1].toUpperCase(),
        nombre: '',
        rawUrl: url,
      };
    }

    console.log('Could not extract RFC from URL');
    return null;
  } catch (error) {
    console.error('Error parsing URL:', error);
    return null;
  }
}

/**
 * Parsea texto estructurado del QR (formato alternativo)
 * El texto puede contener datos separados por |, _, newlines, etc.
 */
function parseCSFText(text: string): CSFData | null {
  console.log('Parsing as text:', text);

  // Buscar patrón de RFC en el texto
  const rfcMatch = text.match(/([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);

  if (rfcMatch) {
    const rfc = rfcMatch[1].toUpperCase();
    console.log('Found RFC in text:', rfc);

    // Intentar extraer el nombre
    // Remover el RFC del texto y buscar el nombre
    let textWithoutRfc = text.replace(rfcMatch[0], '');

    // Separar por diferentes delimitadores comunes
    const parts = textWithoutRfc.split(/[|\n_,;]+/).map(p => p.trim()).filter(p => p.length > 2);

    let nombre = '';

    // Buscar la parte que parece un nombre (no es número, no es código postal, etc.)
    for (const part of parts) {
      // Ignorar partes que son solo números o muy cortas
      if (part.length > 3 && !part.match(/^\d+$/) && !part.match(/^[A-Z]{2,4}\d/i)) {
        nombre = part;
        break;
      }
    }

    console.log('Extracted nombre:', nombre);

    return {
      rfc: rfc,
      nombre: nombre.toUpperCase(),
    };
  }

  console.log('No RFC found in text');
  return null;
}

/**
 * Valida si los datos extraídos son suficientes para el registro
 * Solo el RFC es obligatorio - el nombre se puede llenar manualmente
 */
export function validateCSFData(data: CSFData): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  if (!data.rfc || data.rfc.length < 12) {
    missingFields.push('RFC');
  }

  // El nombre es opcional - el QR del SAT no siempre lo incluye
  // El usuario puede llenarlo manualmente

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
