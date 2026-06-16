import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, PageBreak,
  convertInchesToTwip,
} from "docx";
import { writeFileSync } from "fs";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BRAND   = "#059669"; // emerald-600
const DARK    = "#18181b"; // zinc-900
const GRAY    = "#71717a"; // zinc-500
const LIGHT   = "#f4f4f5"; // zinc-100
const WHITE   = "#ffffff";
const YELLOW  = "#fef9c3";
const YELLOW_BORDER = "#ca8a04";

const H1 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 400, after: 160 },
  run: { color: DARK, bold: true, size: 36 },
});

const H2 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 320, after: 120 },
  run: { color: BRAND, bold: true, size: 28 },
});

const H3 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 80 },
  run: { color: DARK, bold: true, size: 24 },
});

const Body = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 22, color: DARK, ...opts })],
  spacing: { after: 100 },
});

const Note = (text) => new Paragraph({
  children: [new TextRun({ text: `💡  ${text}`, size: 20, color: "#3b82f6", italics: true })],
  spacing: { before: 80, after: 160 },
  indent: { left: 360 },
});

const Warn = (text) => new Paragraph({
  children: [new TextRun({ text: `⚠️  ${text}`, size: 20, color: "#b45309", bold: true })],
  spacing: { before: 80, after: 160 },
  indent: { left: 360 },
});

const spacer = (n = 1) =>
  Array.from({ length: n }, () => new Paragraph({ text: "", spacing: { after: 60 } }));

const bullet = (text, level = 0) => new Paragraph({
  children: [new TextRun({ text, size: 22, color: DARK })],
  bullet: { level },
  spacing: { after: 80 },
});

const checkItem = (text, done = false) => new Paragraph({
  children: [
    new TextRun({ text: done ? "☑  " : "☐  ", size: 22, color: done ? BRAND : GRAY, bold: true }),
    new TextRun({ text, size: 22, color: DARK }),
  ],
  spacing: { after: 100 },
  indent: { left: 180 },
});

const stepRow = (num, label, detail) => new TableRow({
  children: [
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: num, size: 22, bold: true, color: WHITE })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.SOLID, color: BRAND },
      width: { size: 6, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
    }),
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: label, size: 22, bold: true, color: DARK })],
      })],
      width: { size: 30, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 120, right: 100 },
    }),
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: detail, size: 20, color: DARK })],
      })],
      width: { size: 64, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 120, right: 100 },
    }),
  ],
});

const twoCol = (col1, col2, header = false) => new TableRow({
  tableHeader: header,
  children: [
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: col1, size: 20, bold: header, color: header ? WHITE : DARK })],
      })],
      shading: header ? { type: ShadingType.SOLID, color: BRAND } : undefined,
      width: { size: 35, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 120, right: 100 },
    }),
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: col2, size: 20, bold: header, color: header ? WHITE : DARK })],
      })],
      shading: header ? { type: ShadingType.SOLID, color: BRAND } : undefined,
      width: { size: 65, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 120, right: 100 },
    }),
  ],
});

// ── Document content ──────────────────────────────────────────────────────────

const doc = new Document({
  creator: "PagaYa",
  title: "PagaYa — Guía de Lanzamiento Completa",
  description: "Todos los pasos necesarios para lanzar PagaYa en producción",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1.2),
          },
        },
      },
      children: [

        // ── Cover ──────────────────────────────────────────────────────────
        new Paragraph({
          children: [new TextRun({ text: "PagaYa", size: 72, bold: true, color: BRAND })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Guía de Lanzamiento Completa", size: 36, color: DARK, bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Pagos QR con factura electrónica SRI para restaurantes en Ecuador", size: 24, color: GRAY, italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 1800 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Versión 1.0  ·  Mayo 2026  ·  Confidencial", size: 20, color: GRAY })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── Introduction ───────────────────────────────────────────────────
        H1("Introducción y Resumen Ejecutivo"),
        Body(
          "Este documento detalla TODOS los pasos necesarios para llevar PagaYa desde el estado actual " +
          "(plataforma técnicamente construida) hasta un producto 100% operativo en producción. " +
          "Está organizado en bloques secuenciales: primero lo legal, luego lo técnico, y finalmente " +
          "el lanzamiento. Sigue el orden estrictamente — algunos pasos desbloquean otros."
        ),
        ...spacer(),
        Note("Tiempo estimado total para estar operativo: 4–8 semanas, dependiendo del tiempo de respuesta de organismos públicos."),

        // ── Table of Contents (manual) ─────────────────────────────────────
        ...spacer(),
        H2("Índice de Pasos"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("BLOQUE", "CONTENIDO", true),
            twoCol("A — Empresa & Legal", "Constitución, RUC, firma electrónica, cuenta bancaria"),
            twoCol("B — Dominio & Email", "Compra del dominio .ec, correo profesional, DNS"),
            twoCol("C — Landing Page", "Textos finales, Resend, dominio en Vercel"),
            twoCol("D — Plataforma Técnica", "Vercel, Supabase, Redis, variables de entorno"),
            twoCol("E — Kushki", "Cuenta plataforma, split payments, sandbox → producción"),
            twoCol("F — Dátil", "Cuenta plataforma y por restaurante, firma electrónica SRI"),
            twoCol("G — Por cada Restaurante", "Onboarding checklist para cada cliente"),
            twoCol("H — Pre-lanzamiento", "Pruebas, PCI, legal, contingencia"),
            twoCol("I — Lanzamiento", "Go-live checklist final"),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE A — EMPRESA & LEGAL
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE A — Empresa, Legal y Fiscal"),
        Body("Antes de abrir cualquier cuenta bancaria, afiliarte a Kushki, o emitir facturas, " +
          "necesitas una empresa legalmente constituida en Ecuador con RUC activo."),

        H2("A1. Constituir la Empresa"),
        Body("PagaYa debe operar bajo una persona jurídica. Las opciones más comunes son:"),
        ...spacer(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Tipo", "Cuándo usarlo", true),
            twoCol("S.A.S. (Sociedad por Acciones Simplificada)", "Recomendada para startups. 1 accionista mínimo. Capital flexible. Constitución online desde el portal de la Superintendencia."),
            twoCol("Cía. Ltda.", "Clásica. 2 socios mínimo. Capital mínimo $400. Más burocracia."),
            twoCol("Persona Natural obligada a llevar contabilidad", "Solo si facturas > $300k/año o tienes capital > $180k. No recomendada para inicio."),
          ],
        }),
        ...spacer(),
        H3("Pasos para constituir una S.A.S."),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Portal Supercias", "Ve a supercias.gob.ec → 'Constitución en línea'. Registra tu usuario con tu cédula."),
            stepRow("2", "Reserva de nombre", "Busca y reserva el nombre 'PagaYa S.A.S.' o similar. Costo: $0. Tarda 1 día hábil."),
            stepRow("3", "Elaborar estatutos", "La plataforma te genera un borrador. Objeto social: 'Desarrollo y comercialización de software de gestión de pagos y facturación electrónica para establecimientos de alimentos y bebidas'."),
            stepRow("4", "Aporte de capital", "Capital mínimo recomendado: $2.000. Deposita en una cuenta de integración de capital en cualquier banco ecuatoriano."),
            stepRow("5", "Elevar a escritura pública", "Lleva los documentos a una notaría. Costo: ~$150–$250. La notaría sube al portal de Supercias."),
            stepRow("6", "Inscripción en Supercias", "La Superintendencia revisa e inscribe. Tarda 3–7 días hábiles. Recibes el Número de Expediente."),
            stepRow("7", "Obtener RUC empresa", "Con los documentos de la empresa ve al SRI o usa el portal sri.gob.ec para inscribir el RUC de la empresa."),
          ],
        }),
        ...spacer(),
        Note("Contacto directo: supercias.gob.ec · Teléfono: 1700-SUPERCIAS (1700-787-374) · Oficinas en Quito: Av. Amazonas N34-451."),
        Warn("El nombre de la empresa y el nombre comercial 'PagaYa' son cosas distintas. El nombre comercial lo puedes proteger como marca en el SENADI."),

        H2("A2. Obtener el RUC de la Empresa"),
        checkItem("Cédula del representante legal (vigente)"),
        checkItem("Copia del nombramiento del representante legal"),
        checkItem("Documento de constitución de la empresa"),
        checkItem("Planilla de servicios básicos del domicilio fiscal (máx. 3 meses)"),
        checkItem("Ir al SRI más cercano o usar sri.gob.ec → 'Servicios en línea'"),
        ...spacer(),
        Note("El RUC de la empresa es DIFERENTE al de cada restaurante cliente. El RUC de PagaYa es el de tu empresa. Cada restaurante tendrá el suyo."),

        H2("A3. Firma Electrónica para PagaYa S.A.S."),
        Body("Necesitas una firma electrónica a nombre de la empresa (o del representante legal) para trámites con el SRI y para firmar contratos digitales."),
        ...spacer(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Proveedor", "Detalles", true),
            twoCol("Security Data", "Más rápido. Costo: ~$30–60/año. Portal: securitydata.net.ec"),
            twoCol("BCE (Banco Central)", "El más barato (~$25/año). Más burocracia. Portal: eci.bce.ec"),
            twoCol("ANF AC Ecuador", "Opción nueva. anfacec.com"),
            twoCol("Uanataca", "Opción nueva. uanataca.com/ec"),
          ],
        }),
        ...spacer(),
        checkItem("Elegir proveedor y crear cuenta en su portal"),
        checkItem("Presentar cédula + RUC + foto en la oficina del proveedor (o videollamada para algunos)"),
        checkItem("Pagar y descargar el archivo .p12 con su contraseña"),
        checkItem("Guardar el .p12 en un lugar seguro — lo necesitarás para Dátil"),
        Warn("El .p12 es como la clave maestra. Si lo pierdes, debes renovar la firma. Guárdalo en al menos dos lugares seguros (Google Drive cifrado + USB)."),

        H2("A4. Cuenta Bancaria Empresarial"),
        Body("Necesitas una cuenta a nombre de la empresa para:"),
        bullet("Recibir pagos de tu suscripción SaaS (plan Pro)"),
        bullet("Recibir la comisión de split payments de Kushki"),
        bullet("Pagar proveedores (Vercel, Dátil, Resend, etc.)"),
        ...spacer(),
        Body("Bancos recomendados para cuentas empresariales en Ecuador:"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Banco", "Por qué", true),
            twoCol("Banco Internacional", "Es uno de los bancos adquirentes de Kushki — necesario para el split. Buena banca online."),
            twoCol("Banco Pacífico", "También banco adquirente de Kushki. Plataforma digital sólida."),
            twoCol("Banco Guayaquil", "Tercer banco adquirente de Kushki. Muy buena app móvil."),
          ],
        }),
        ...spacer(),
        Warn("Abre tu cuenta en uno de los tres bancos adquirentes de Kushki (Internacional, Pacífico, Guayaquil). Kushki deposita el split a ese banco. Si tienes cuenta en otro banco, habrá pasos adicionales."),
        checkItem("Documentos: escritura de constitución + RUC empresa + cédula representante legal + nombramiento"),
        checkItem("Pedir certificado bancario (lo necesitará Kushki) — emitido hace menos de 3 meses"),

        H2("A5. Marca Comercial — SENADI (Opcional pero Recomendado)"),
        Body("Protege el nombre 'PagaYa' como marca registrada para evitar que otros lo usen."),
        checkItem("Portal: senadi.gob.ec → 'Signos Distintivos'"),
        checkItem("Buscar si 'PagaYa' ya está registrado (búsqueda gratuita)"),
        checkItem("Presentar solicitud de registro en clase 42 (servicios de software) y clase 36 (servicios financieros/pagos)"),
        checkItem("Costo: ~$208 por clase. Tarda 6–12 meses el proceso completo"),
        Note("El registro de marca no es bloqueante para lanzar. Puedes usarlo comercialmente mientras tramitas el registro."),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE B — DOMINIO & EMAIL
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE B — Dominio y Email Profesional"),

        H2("B1. Comprar el Dominio"),
        Body("Registra pagaya.ec (dominio ecuatoriano) Y pagaya.com (para cobertura internacional y links de email)."),
        ...spacer(),
        H3("pagaya.ec (dominio ecuatoriano)"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "NIC Ecuador", "Ve a nic.ec — es el único registrador oficial de dominios .ec"),
            stepRow("2", "Verificar disponibilidad", "Busca 'pagaya' en nic.ec/registro-dominio"),
            stepRow("3", "Requisitos .ec", "Necesitas RUC ecuatoriano o cédula. Costo: ~$35/año"),
            stepRow("4", "Registrar", "Crea cuenta, sube el RUC de la empresa y paga. Activación en 24h."),
          ],
        }),
        ...spacer(),
        H3("pagaya.com (dominio internacional)"),
        checkItem("Registrar en Namecheap (namecheap.com) o Cloudflare Registrar (cloudflare.com)"),
        checkItem("Costo: ~$10-15/año en Namecheap"),
        checkItem("Recomendado: Cloudflare Registrar (al costo, sin markup, mejor DNS)"),
        ...spacer(),
        Note("Si pagaya.com o pagaya.ec ya están tomados, considera: pagaya.app, usepagaya.com, pagaya.io. Para Ecuador, el .ec es el más profesional y confiable."),

        H2("B2. Configurar Email Profesional"),
        Body("Necesitas emails como hola@pagaya.ec, juan@pagaya.ec, noreply@pagaya.ec."),
        ...spacer(),
        H3("Opción A — Google Workspace (Recomendada)"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Crear cuenta", "workspace.google.com → 'Empezar'. Plan Business Starter: $6 USD/usuario/mes."),
            stepRow("2", "Verificar dominio", "Google te da un código TXT. Agrégalo en los DNS de tu dominio en NIC.ec o Cloudflare."),
            stepRow("3", "Configurar MX records", "Google Workspace te da los registros MX. Agrégalos en los DNS de tu dominio."),
            stepRow("4", "Crear emails", "hola@pagaya.ec (contacto), noreply@pagaya.ec (transaccional), juan@pagaya.ec (personal)"),
          ],
        }),
        ...spacer(),
        H3("Opción B — Zoho Mail (Gratis hasta 5 usuarios)"),
        checkItem("zoho.com/mail → 'Free Plan'. Hasta 5 cuentas gratuitas."),
        checkItem("Misma configuración de DNS que Google Workspace pero con los registros de Zoho."),
        ...spacer(),
        Note("El email noreply@pagaya.ec se usará para enviar facturas y notificaciones del sistema. El email hola@pagaya.ec recibirá los formularios de contacto de la landing page."),

        H2("B3. Configurar DNS Completo"),
        Body("Una vez tengas el dominio y el email, configura estos registros DNS:"),
        ...spacer(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Registro DNS", "Para qué sirve", true),
            twoCol("A / CNAME → Vercel", "Apunta pagaya.ec a tu app en Vercel (se configura en el dashboard de Vercel)"),
            twoCol("MX records → Google/Zoho", "Recibir emails en @pagaya.ec"),
            twoCol("TXT → Google verify", "Verificar dominio en Google Workspace"),
            twoCol("SPF, DKIM, DMARC", "Evitar que tus emails lleguen a spam. Google/Zoho los generan automáticamente."),
            twoCol("TXT → Resend verify", "Verificar dominio en Resend para enviar emails transaccionales"),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE C — LANDING PAGE
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE C — Landing Page de PagaYa"),
        Body("La landing page ya está construida. Estos son los pasos para dejarla 100% lista y publicada."),

        H2("C1. Contenido que debes personalizar"),
        checkItem("Cambiar email de contacto: reemplaza 'hola@pagaya.ec' con tu email real en src/app/page.tsx → sección Contact"),
        checkItem("Cambiar número de WhatsApp: reemplaza '+593 99 000 0000' con tu número real"),
        checkItem("Cambiar 'Quito, Ecuador' por tu dirección exacta si la tienes"),
        checkItem("Revisar y ajustar los precios de los planes (Starter, Pro, Empresarial) si cambian"),
        checkItem("Agregar tu logo si tienes uno: reemplaza el texto 'PagaYa' en el navbar por un <img>"),
        checkItem("Cambiar los links del footer a páginas reales (Términos, Privacidad) cuando las tengas"),

        H2("C2. Páginas Legales (Requeridas)"),
        Body("Necesitas crear al menos estas dos páginas antes de lanzar públicamente:"),
        ...spacer(),
        checkItem("Crear src/app/terminos/page.tsx — Términos y Condiciones del servicio"),
        checkItem("Crear src/app/privacidad/page.tsx — Política de Privacidad (LGPD-Ecuador compatible)"),
        checkItem("Agregar links a estas páginas en el footer de la landing"),
        ...spacer(),
        Note("Para los textos legales, usa un abogado en Ecuador o adapta una plantilla. La Ley Orgánica de Protección de Datos Personales (LOPDP) de Ecuador entró en vigor en 2023 y es obligatoria."),

        H2("C3. Configurar Resend para el Formulario de Contacto"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Crear cuenta Resend", "Ve a resend.com → Sign up. El plan gratuito incluye 3.000 emails/mes."),
            stepRow("2", "Agregar dominio", "En Resend → Domains → Add Domain. Escribe 'pagaya.ec'. Te dará registros DNS."),
            stepRow("3", "Configurar DNS", "Agrega los registros TXT y CNAME que Resend te da en tu proveedor de DNS (NIC.ec o Cloudflare)."),
            stepRow("4", "Verificar dominio", "Espera 5–30 minutos y haz clic en 'Verify' en Resend. Debe aparecer un check verde."),
            stepRow("5", "Crear API Key", "Resend → API Keys → Create API Key. Copia la clave."),
            stepRow("6", "Agregar a .env", "RESEND_API_KEY=re_xxxx\nCONTACT_EMAIL=hola@pagaya.ec"),
            stepRow("7", "Actualizar el from", "En src/app/api/contact/route.ts cambia from: a noreply@pagaya.ec"),
          ],
        }),
        ...spacer(),
        Note("Con Resend, cada vez que alguien llene el formulario de contacto de la landing page, recibirás un email en hola@pagaya.ec con todos los datos del lead."),

        H2("C4. SEO Básico"),
        checkItem("Actualizar metadata en src/app/layout.tsx: title, description, og:image, og:title"),
        checkItem("Crear un favicon: coloca el archivo favicon.ico en src/app/"),
        checkItem("Crear robots.txt en public/robots.txt"),
        checkItem("Crear sitemap.xml en public/sitemap.xml"),
        checkItem("Registrar el sitio en Google Search Console (search.google.com/search-console)"),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE D — PLATAFORMA TÉCNICA
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE D — Plataforma Técnica (Infraestructura)"),
        Body("Todos los servicios que necesitas contratar y configurar para que PagaYa funcione en producción."),

        H2("D1. Vercel — Hosting y Deploy"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Crear cuenta", "vercel.com → Sign up con GitHub. El plan Hobby es gratuito para empezar."),
            stepRow("2", "Conectar repositorio", "Vercel → New Project → Import Git Repository → selecciona tu repo de PagaYa."),
            stepRow("3", "Configurar build", "Framework: Next.js. Build command: npm run build. Output directory: .next (automático)."),
            stepRow("4", "Agregar dominio", "Vercel → Project → Settings → Domains → Add → 'pagaya.ec'. Vercel te da los registros DNS."),
            stepRow("5", "Configurar env vars", "Vercel → Settings → Environment Variables. Agrega TODAS las variables de Bloque D2."),
            stepRow("6", "Primer deploy", "Vercel despliega automáticamente cuando haces git push a main."),
          ],
        }),
        ...spacer(),
        Note("Cuando el tráfico crezca, considera el plan Pro de Vercel ($20/mes) que incluye más funciones de analytics, mayor ancho de banda y soporte de equipo."),

        H2("D2. Supabase — Base de Datos PostgreSQL"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Crear cuenta", "supabase.com → Sign up. Plan gratuito incluye 500MB de base de datos."),
            stepRow("2", "Crear proyecto", "New Project → Nombre: 'pagaya-prod' → Región: US East o South America → Contraseña segura."),
            stepRow("3", "Obtener DATABASE_URL", "Settings → Database → Connection String → Session mode (IPv4). Formato: postgresql://postgres.[ref]:[pass]@aws-1-..."),
            stepRow("4", "Agregar a Vercel", "Copia DATABASE_URL y agrégala en Vercel → Environment Variables."),
            stepRow("5", "Ejecutar migraciones", "Con DATABASE_URL configurada: npx prisma migrate deploy desde tu máquina local."),
            stepRow("6", "Verificar tablas", "Supabase → Table Editor. Debes ver: restaurants, users, tables, bills, payments, factura_jobs."),
          ],
        }),
        ...spacer(),
        Note("El plan gratuito de Supabase pausa el proyecto después de 7 días de inactividad. Para producción, considera el plan Pro ($25/mes) que no pausa."),

        H2("D3. Upstash Redis — Rate Limiting"),
        checkItem("Ve a upstash.com → Create Database"),
        checkItem("Nombre: 'pagaya-ratelimit' → Región: US-East-1 (más cercano a Vercel)"),
        checkItem("Tipo: Redis. Plan: Free (10.000 commands/day gratuito)"),
        checkItem("Copia UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN"),
        checkItem("Agrega ambas variables a Vercel → Environment Variables"),

        H2("D4. Variables de Entorno Completas"),
        Body("Lista completa de variables que debes tener en Vercel → Settings → Environment Variables:"),
        ...spacer(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Variable", "Cómo obtenerla", true),
            twoCol("DATABASE_URL", "Supabase → Settings → Database → Connection String"),
            twoCol("NEXTAUTH_SECRET", "Terminal: openssl rand -base64 32"),
            twoCol("NEXTAUTH_URL", "https://pagaya.ec (tu dominio en producción)"),
            twoCol("ADMIN_SECRET", "Terminal: openssl rand -hex 16 (cualquier string secreto)"),
            twoCol("ENCRYPTION_KEY", "Terminal: openssl rand -hex 32 (exactamente 64 caracteres hex)"),
            twoCol("NEXT_PUBLIC_APP_URL", "https://pagaya.ec"),
            twoCol("RESEND_API_KEY", "Resend → API Keys → Create API Key"),
            twoCol("CONTACT_EMAIL", "hola@pagaya.ec"),
            twoCol("UPSTASH_REDIS_REST_URL", "Upstash → Database → REST API"),
            twoCol("UPSTASH_REDIS_REST_TOKEN", "Upstash → Database → REST API"),
            twoCol("CRON_SECRET", "Terminal: openssl rand -hex 32"),
            twoCol("NEXT_PUBLIC_KUSHKI_PUBLIC_KEY", "Kushki → Dashboard → Credenciales (Bloque E)"),
            twoCol("KUSHKI_SECRET_KEY", "Kushki → Dashboard → Credenciales (Bloque E)"),
          ],
        }),
        ...spacer(),
        Warn("NUNCA pongas estas variables en el código ni en el repositorio de Git. Solo en Vercel → Environment Variables y en tu archivo .env local (que está en .gitignore)."),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE E — KUSHKI
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE E — Kushki (Procesador de Pagos)"),
        Body(
          "Kushki es el procesador de pagos que usará PagaYa. Necesitas DOS cuentas distintas: " +
          "una para tu empresa PagaYa S.A.S. (para recibir la comisión del split) y " +
          "otra para CADA restaurante cliente (para recibir el pago de sus clientes)."
        ),

        H2("E1. Cuenta Kushki para PagaYa S.A.S. (la plataforma)"),
        Body("Esta cuenta recibe el porcentaje de comisión de cada transacción (el split payment)."),
        ...spacer(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Contactar a Kushki", "Email: comercial@kushkipagos.com o por kushkipagos.com/es → 'Comienza ahora'. Explica que eres una plataforma SaaS que necesita 'comisiones a terceros' (split payments)."),
            stepRow("2", "Documentos a presentar", "RUC de PagaYa S.A.S. + cédula del representante legal + certificado bancario (< 3 meses) + composición accionaria."),
            stepRow("3", "Seleccionar banco adquirente", "Internacional, Pacífico o Guayaquil. Debe ser el mismo donde abriste la cuenta empresarial."),
            stepRow("4", "Configurar split payments", "Pedir explícitamente habilitar 'Comisiones a terceros'. Kushki lo configura en tu cuenta. Define el porcentaje de comisión (recomendado: 1–2%)."),
            stepRow("5", "Obtener credenciales sandbox", "Kushki te da: Merchant ID + Public Key + Secret Key para ambiente de pruebas."),
            stepRow("6", "Obtener credenciales producción", "Después de pruebas exitosas, Kushki activa las credenciales de producción."),
            stepRow("7", "Tiempo de onboarding", "5–15 días hábiles para KYC completo."),
          ],
        }),
        ...spacer(),
        Note("Las credenciales de PagaYa (Public Key y Secret Key) son las que van en las variables de entorno NEXT_PUBLIC_KUSHKI_PUBLIC_KEY y KUSHKI_SECRET_KEY de tu plataforma."),

        H2("E2. Ambiente Sandbox (Pruebas)"),
        Body("Antes de ir a producción, prueba todo en el ambiente de sandbox de Kushki."),
        checkItem("API de sandbox: https://api-uat.kushkipagos.com"),
        checkItem("Tarjetas de prueba: docs.kushki.com/ec → 'Test cards'"),
        checkItem("Probar una transacción de $10 completa: desde el QR hasta el webhook de aprobación"),
        checkItem("Probar una transacción rechazada y verificar que el sistema la maneja"),
        checkItem("Probar un reembolso desde el dashboard de manager"),
        checkItem("Verificar que el split llega a ambas cuentas (restaurante + plataforma)"),
        checkItem("Verificar que los webhooks de Kushki llegan a https://pagaya.ec/api/webhooks/kushki"),
        Warn("NO configures las credenciales de producción hasta que todas las pruebas en sandbox pasen. Un error en producción genera transacciones reales con dinero real."),

        H2("E3. Registro de Cada Restaurante en Kushki"),
        Body("Cada restaurante que use PagaYa necesita su propia cuenta Kushki. Este es el proceso para cada uno:"),
        checkItem("RUC actualizado del restaurante (emitido/reimpreso hace ≤ 3 meses)"),
        checkItem("Cédula del representante legal del restaurante vigente"),
        checkItem("Certificado bancario del restaurante (≤ 3 meses)"),
        checkItem("Composición accionaria del restaurante"),
        checkItem("Formulario de afiliación Kushki firmado"),
        checkItem("Selección del banco adquirente (Internacional, Pacífico o Guayaquil)"),
        checkItem("Tiempo: 5–15 días hábiles por restaurante"),
        checkItem("Una vez activo: restaurante ingresa sus credenciales en el dashboard de PagaYa → Configuración → Pagos"),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE F — DÁTIL
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE F — Dátil (Facturación Electrónica SRI)"),
        Body(
          "Dátil es el proveedor de facturación electrónica. No necesitas integrarte directamente con el SRI — " +
          "Dátil lo hace por ti. CADA restaurante necesita su propia cuenta en Dátil con su propio RUC."
        ),

        H2("F1. Cuenta de Dátil para Cada Restaurante"),
        Body("El restaurante (o tú en nombre de ellos) hace este proceso UNA vez por restaurante:"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            stepRow("1", "Crear cuenta en Dátil", "Ve a app.datil.co → Sign up. Email del restaurante o del administrador."),
            stepRow("2", "Ingresar datos del emisor", "RUC del restaurante, razón social, nombre comercial, dirección, código de establecimiento (001), punto de emisión (001)."),
            stepRow("3", "Subir la firma electrónica", "El restaurante debe tener un archivo .p12 (firma electrónica) a su nombre. Se sube en Dátil → Configuración → Firma electrónica."),
            stepRow("4", "Configurar ambiente", "Primero en 'Pruebas' (sandbox). Cuando esté listo, cambiar a 'Producción'. El SRI debe haber autorizado el ambiente de producción."),
            stepRow("5", "Autorizar producción en SRI", "El restaurante va al portal sri.gob.ec → Servicios en línea → 'Solicitar autorización de comprobantes electrónicos'. O va físicamente al SRI."),
            stepRow("6", "Probar en sandbox", "Dátil → Emitir comprobante de prueba. Verificar que llega el XML + RIDE al email."),
            stepRow("7", "Obtener API Key", "Dátil → Configuración → API → Crear API Key. Copiar la clave."),
            stepRow("8", "Ingresar en PagaYa", "En el dashboard del restaurante → Configuración → Facturación (Dátil) → pegar la API Key y activar."),
          ],
        }),
        ...spacer(),
        Note("La firma electrónica del restaurante la puede obtener en Security Data (securitydata.net.ec), BCE (eci.bce.ec) o Uanataca. Cuesta ~$25–60/año y dura 2 años."),
        Warn("El .p12 del restaurante debe ser a nombre del restaurante (su RUC), NO a nombre tuyo ni de PagaYa. Si firmas con el .p12 equivocado, el SRI rechazará la factura."),

        H2("F2. Planes de Dátil"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Plan", "Costo y límite", true),
            twoCol("Free / Básico", "Hasta 50 documentos/mes. Ideal para restaurantes pequeños."),
            twoCol("Estándar", "~$15/mes. Hasta 500 documentos/mes. La mayoría de restaurantes."),
            twoCol("Profesional", "~$25/mes. Documentos ilimitados. Restaurantes con alto volumen."),
          ],
        }),
        ...spacer(),
        Note("Puedes negociar un acuerdo con Dátil como revendedor o plataforma. Pregunta por su programa de partners en soporte@datil.com — posiblemente obtengas descuentos por volumen."),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE G — POR CADA RESTAURANTE
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE G — Onboarding de Cada Restaurante"),
        Body("Este es el checklist que debes completar con CADA restaurante que se una a PagaYa."),

        H2("G1. Documentos y Datos a Recopilar del Restaurante"),
        checkItem("Nombre comercial y razón social legal"),
        checkItem("RUC de 13 dígitos (activo en el SRI)"),
        checkItem("Dirección del establecimiento (para la factura)"),
        checkItem("Código de establecimiento SRI (generalmente 001)"),
        checkItem("Punto de emisión SRI (generalmente 001)"),
        checkItem("Régimen tributario: General / RIMPE Emprendedor / RIMPE Negocio Popular"),
        checkItem("¿Es obligado a llevar contabilidad?"),
        checkItem("Email de contacto del restaurante (recibirá notificaciones del sistema)"),
        checkItem("Teléfono del restaurante"),
        checkItem("Logo en PNG o SVG (para el header de las facturas)"),

        H2("G2. Cuenta Kushki del Restaurante"),
        checkItem("Acompañar al restaurante en el proceso de afiliación a Kushki (ver Bloque E3)"),
        checkItem("Una vez activo, el restaurante ingresa en PagaYa → Configuración → Pagos: Merchant ID, Public Key, Secret Key, ambiente"),
        checkItem("Hacer una transacción de prueba de $1 para verificar"),
        checkItem("Verificar que el split llegó a ambas cuentas"),

        H2("G3. Cuenta Dátil del Restaurante"),
        checkItem("El restaurante crea su cuenta en app.datil.co con su RUC"),
        checkItem("El restaurante sube su .p12 a Dátil"),
        checkItem("El restaurante solicita ambiente de producción en el SRI"),
        checkItem("El restaurante ingresa su API Key de Dátil en PagaYa → Configuración → Facturación"),
        checkItem("Emitir una factura de prueba por $0.01 y verificar que llegó autorizada por el SRI"),

        H2("G4. Configurar las Mesas"),
        checkItem("Restaurante entra a PagaYa → Mesas → Crear mesas (una por mesa física)"),
        checkItem("Descargar los QR de cada mesa en PDF"),
        checkItem("Imprimir los QR (recomendado: laminados en tamaño A6 o tarjeta de presentación)"),
        checkItem("Colocar los QR en las mesas"),
        checkItem("Probar el flujo completo: escanear → ver cuenta → pagar → recibir factura"),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE H — PRE-LANZAMIENTO
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE H — Pre-lanzamiento y Validación"),

        H2("H1. Pruebas Técnicas Obligatorias"),
        checkItem("Flujo completo de pago con tarjeta (sandbox → producción)"),
        checkItem("Flujo de factura electrónica: pago → Dátil → SRI → email al cliente"),
        checkItem("División de cuenta: partes iguales, por ítem, monto personalizado"),
        checkItem("Pago desde móvil iOS (Safari) con tarjeta"),
        checkItem("Pago desde móvil Android (Chrome) con tarjeta"),
        checkItem("Apple Pay funcionando (requiere dominio HTTPS y certificado de Apple — Kushki lo gestiona)"),
        checkItem("Google Pay funcionando"),
        checkItem("Webhook de pago aprobado → mesa marcada como pagada"),
        checkItem("Webhook de pago rechazado → manejo de error claro"),
        checkItem("Reembolso desde dashboard → Kushki → Dátil nota de crédito"),
        checkItem("Reintento de factura si Dátil/SRI está caído (cron job)"),
        checkItem("Rate limiting: más de 5 intentos de pago en 1 minuto rechazados"),
        checkItem("QR expirado o inválido → error claro, no crash"),

        H2("H2. Revisión Legal con Abogado"),
        checkItem("Revisar el flujo de factura + propina con un tributario en Quito (1–2 horas)"),
        checkItem("Confirmar que el desglose 10% propina en la factura cumple el Decreto 1971"),
        checkItem("Revisar los Términos y Condiciones con un abogado"),
        checkItem("Revisar la Política de Privacidad para cumplir la LOPDP (Ley de Protección de Datos Ecuador)"),
        checkItem("Firmar contrato de servicio con cada restaurante (protege a ambas partes)"),

        H2("H3. PCI DSS Compliance"),
        Body("Porque usas Kushki Hosted Fields, ya estás en el alcance mínimo (SAQ-A). De todas formas:"),
        checkItem("Completar el cuestionario PCI SAQ-A (autocertificación, 22 preguntas). Disponible en pcisecuritystandards.org"),
        checkItem("Verificar que HTTPS está activo en todos los endpoints (Vercel lo activa automáticamente)"),
        checkItem("Verificar que las claves secretas NUNCA aparecen en los logs de Vercel"),
        checkItem("Verificar que el formulario de tarjeta es el iframe de Kushki, no un input propio"),

        H2("H4. Plan de Contingencia"),
        checkItem("¿Qué pasa si el SRI está caído? → Las facturas se encolan y se emiten cuando el SRI vuelve (ya implementado vía cron job)"),
        checkItem("¿Qué pasa si Kushki está caído? → Mostrar mensaje claro al cliente. No hay alternativa automática en MVP."),
        checkItem("¿Qué pasa si Vercel está caído? → Vercel tiene SLA 99.99%. Monitorear en status.vercel.com"),
        checkItem("¿Qué pasa si Supabase está caído? → Supabase tiene SLA 99.9%. Monitorear en status.supabase.com"),
        Note("Agrega UptimeRobot (uptimerobot.com — gratuito) para monitorear tu sitio y recibir alertas si cae."),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // BLOQUE I — LANZAMIENTO
        // ══════════════════════════════════════════════════════════════════
        H1("BLOQUE I — Lanzamiento Final"),

        H2("I1. Go-Live Checklist (Día del Lanzamiento)"),
        checkItem("Dominio pagaya.ec apuntando a Vercel con HTTPS activo"),
        checkItem("Todas las variables de entorno de producción cargadas en Vercel"),
        checkItem("Base de datos de producción con migraciones aplicadas"),
        checkItem("Kushki en modo PRODUCCIÓN (no sandbox)"),
        checkItem("Dátil de restaurante piloto en modo PRODUCCIÓN"),
        checkItem("Resend verificado con dominio pagaya.ec"),
        checkItem("Email hola@pagaya.ec recibiendo correctamente"),
        checkItem("Landing page live en pagaya.ec"),
        checkItem("Google Analytics o Vercel Analytics activado"),
        checkItem("Primer restaurante piloto configurado y probado en producción"),
        checkItem("Flujo de pago real de $1 → aprobado → factura emitida → email enviado"),
        checkItem("Dashboard de admin accesible con ADMIN_SECRET configurado"),

        H2("I2. Primer Restaurante Piloto"),
        Body(
          "Antes de escalar, lanza con UN restaurante de confianza (idealmente uno donde conozcas al dueño). " +
          "Esto te permite identificar problemas reales en producción antes de que afecten a más clientes."
        ),
        ...spacer(),
        checkItem("Elegir restaurante piloto (amigo / conocido / familiar)"),
        checkItem("Configurar todos sus datos en la plataforma (mesas, menú, credenciales)"),
        checkItem("Capacitar al personal: cómo abrir cuentas, agregar ítems, cerrar la mesa"),
        checkItem("Operar en paralelo con su método actual los primeros 2–4 semanas"),
        checkItem("Documentar cada problema que surja y resolverlo"),
        checkItem("Obtener testimonial y caso de éxito para la landing page"),

        H2("I3. Métricas a Monitorear desde el Día 1"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Métrica", "Herramienta / Cómo verla", true),
            twoCol("Pagos exitosos vs rechazados", "Dashboard de Kushki → Transacciones"),
            twoCol("Facturas emitidas vs fallidas", "Dashboard de PagaYa → Admin → Factura Jobs"),
            twoCol("Tiempo promedio de checkout", "Vercel Analytics → Web Vitals"),
            twoCol("Errores en producción", "Vercel → Runtime Logs"),
            twoCol("Uptime del sitio", "UptimeRobot (alerta por email/WhatsApp)"),
            twoCol("Leads del formulario de contacto", "Email hola@pagaya.ec"),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // RESUMEN CRONOLÓGICO
        // ══════════════════════════════════════════════════════════════════
        H1("Resumen Cronológico — Orden de Ejecución"),
        Body("Sigue este orden estrictamente. Cada semana desbloquea la siguiente."),
        ...spacer(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            twoCol("Semana", "Qué hacer", true),
            twoCol("Semana 1", "A1+A2: Iniciar constitución S.A.S. en Supercias · A3: Solicitar firma electrónica · B1: Comprar dominio pagaya.ec y pagaya.com"),
            twoCol("Semana 2", "A4: Abrir cuenta bancaria empresarial · B2+B3: Configurar email y DNS · E1: Contactar a Kushki para la cuenta de la plataforma"),
            twoCol("Semana 3", "A1 cont.: Completar escritura en notaría y esperar inscripción · C1+C2+C3: Personalizar landing page, crear páginas legales, conectar Resend"),
            twoCol("Semana 4", "A2: Obtener RUC empresa · D1+D2+D3: Configurar Vercel, Supabase y Upstash · D4: Cargar todas las env vars"),
            twoCol("Semana 5", "E2: Probar Kushki sandbox de principio a fin · F1: Primer restaurante piloto crea cuenta en Dátil, sube .p12, solicita producción en SRI"),
            twoCol("Semana 6", "G1–G4: Onboarding completo del restaurante piloto · H1: Pruebas técnicas completas · H2: Revisión legal"),
            twoCol("Semana 7", "H3+H4: PCI checklist y plan de contingencia · I1: Go-live checklist final"),
            twoCol("Semana 8", "I2: Lanzamiento oficial con restaurante piloto · I3: Activar monitoreo · A5: Iniciar registro de marca en SENADI"),
          ],
        }),
        ...spacer(2),
        new Paragraph({
          children: [
            new TextRun({ text: "¡Mucho éxito con PagaYa! 🚀", size: 30, bold: true, color: BRAND }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Documento generado automáticamente · PagaYa · Mayo 2026", size: 18, color: GRAY, italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120 },
        }),
      ],
    },
  ],
});

// ── Export ────────────────────────────────────────────────────────────────────

const buffer = await Packer.toBuffer(doc);
writeFileSync("PagaYa-Guia-Lanzamiento.docx", buffer);
console.log("✅  Documento creado: PagaYa-Guia-Lanzamiento.docx");
