import nodemailer from 'nodemailer'

function createTransport() {
  const user = process.env.ALERT_EMAIL
  const pass = process.env.ALERT_EMAIL_PASSWORD

  if (!user || !pass) {
    throw new Error(
      'Email not configured. Add ALERT_EMAIL and ALERT_EMAIL_PASSWORD to .env.local.\n' +
      'See .env.local.example for setup instructions.'
    )
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

export async function sendAvailabilityAlert(params: {
  to: string
  campgroundName: string
  availableSites: number
  startDate: string
  endDate: string
  reserveUrl: string
  source: string
}) {
  const transport = createTransport()

  const sourceName: Record<string, string> = {
    recgov: 'Recreation.gov',
    cpw: 'Colorado State Parks',
    freecampsites: 'FreeCampsites.net',
    thedyrt: 'The Dyrt',
    hipcamp: 'Hipcamp',
  }

  const sitesText =
    params.availableSites === 1
      ? '1 site opened up'
      : `${params.availableSites} sites opened up`

  await transport.sendMail({
    from: `"Colorado Camp Finder" <${process.env.ALERT_EMAIL}>`,
    to: params.to,
    subject: `⛺ ${sitesText} at ${params.campgroundName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:system-ui,sans-serif;">
<div style="max-width:500px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:#15803d;padding:24px 28px;">
    <div style="font-size:32px;margin-bottom:8px;">⛺</div>
    <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">Campsite Available!</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Your watchlist alert triggered</p>
  </div>

  <div style="padding:24px 28px;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:18px;font-weight:700;color:#14532d;margin-bottom:6px;">${params.campgroundName}</div>
      <div style="color:#16a34a;font-weight:600;font-size:15px;margin-bottom:4px;">${sitesText}</div>
      <div style="color:#6b7280;font-size:13px;">${params.startDate} → ${params.endDate}</div>
      <div style="color:#9ca3af;font-size:11px;margin-top:4px;">via ${sourceName[params.source] || params.source}</div>
    </div>

    <a href="${params.reserveUrl}" style="
      display:block;text-align:center;
      background:#15803d;color:white;
      padding:14px 20px;border-radius:10px;
      text-decoration:none;font-weight:700;font-size:16px;
    ">Reserve Now →</a>

    <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:20px;margin-bottom:0;">
      Colorado Camp Finder · Availability may change quickly
    </p>
  </div>
</div>
</body>
</html>
    `,
  })
}
