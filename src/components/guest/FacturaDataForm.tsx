'use client';

import { useState } from 'react';

interface GuestData { identificacion: string; nombre: string; email: string; }
interface FacturaDataFormProps { language: 'es' | 'en'; onSubmit: (data: GuestData) => void; isLoading?: boolean; }

const tx = {
  es: { cedula: 'Cédula o RUC', nombre: 'Nombre o Razón Social', email: 'Correo Electrónico', required: 'Este campo es obligatorio', invalidEmail: 'Correo inválido', invalidId: 'Cédula/RUC debe tener entre 10 y 13 caracteres', submit: 'Continuar al Pago' },
  en: { cedula: 'ID or RUC', nombre: 'Name or Business Name', email: 'Email Address', required: 'This field is required', invalidEmail: 'Invalid email', invalidId: 'ID/RUC must be 10-13 characters', submit: 'Continue to Payment' },
};

const fieldStyle: React.CSSProperties = {
  width: '100%', minHeight: 54, padding: '0 16px', borderRadius: 16,
  border: '1px solid var(--c-sep)', background: 'var(--c-card)',
  fontFamily: 'inherit', fontSize: 17, fontWeight: 500, color: 'var(--c-ink)',
  outline: 'none', transition: 'border-color .2s, box-shadow .2s',
};

const errStyle: React.CSSProperties = { fontSize: 13, color: '#b91c1c', marginTop: 5, paddingLeft: 4 };

export function FacturaDataForm({ language, onSubmit, isLoading = false }: FacturaDataFormProps) {
  const t = tx[language];
  const [form, setForm] = useState<GuestData>({ identificacion: '', nombre: '', email: '' });
  const [errors, setErrors] = useState<Partial<GuestData>>({});
  const [focused, setFocused] = useState<keyof GuestData | null>(null);

  const validate = () => {
    const e: Partial<GuestData> = {};
    if (!form.identificacion.trim()) e.identificacion = t.required;
    else if (form.identificacion.length < 10 || form.identificacion.length > 13) e.identificacion = t.invalidId;
    if (!form.nombre.trim()) e.nombre = t.required;
    if (!form.email.trim()) e.email = t.required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t.invalidEmail;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onSubmit(form);
  };

  const field = (id: keyof GuestData, label: string, type = 'text', inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'], placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 650, color: 'var(--c-ink-2)', marginBottom: 7, paddingLeft: 2 }}>{label}</label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={form[id]}
        disabled={isLoading}
        autoComplete={id === 'email' ? 'email' : id === 'nombre' ? 'name' : 'off'}
        style={{
          ...fieldStyle,
          borderColor: errors[id] ? 'rgba(185,28,28,.5)' : focused === id ? 'rgba(47,179,126,.55)' : 'var(--c-sep)',
          boxShadow: errors[id] ? '0 0 0 4px rgba(185,28,28,.08)' : focused === id ? '0 0 0 4px var(--accent-soft)' : 'none',
          opacity: isLoading ? 0.5 : 1,
        }}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused(null)}
        onChange={e => {
          setForm(p => ({ ...p, [id]: e.target.value }));
          if (errors[id]) setErrors(p => ({ ...p, [id]: undefined }));
        }}
      />
      {errors[id] && <p style={errStyle}>{errors[id]}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {field('identificacion', t.cedula, 'text', 'numeric', '1234567890')}
      {field('nombre', t.nombre, 'text', undefined, language === 'es' ? 'Tu Nombre' : 'Your Name')}
      {field('email', t.email, 'email', 'email', 'email@ejemplo.com')}
      <button
        type="submit"
        disabled={isLoading}
        className="c-pay-btn"
        style={{ marginTop: 8 }}
      >
        {isLoading ? (language === 'es' ? 'Procesando…' : 'Processing…') : t.submit}
      </button>
    </form>
  );
}
