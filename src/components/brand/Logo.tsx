import Link from 'next/link'
import { DropMark } from './DropMark'
import styles from './Logo.module.css'

/** Logotipo: el símbolo y el nombre compuesto en dos niveles. */
export function Logo({
  href = '/',
  tone = 'ink',
  size = 'md',
}: {
  href?: string
  tone?: 'ink' | 'paper'
  size?: 'md' | 'lg'
}) {
  const onInk = tone === 'paper'
  return (
    <Link href={href} className={`${styles.logo} ${onInk ? styles.paper : ''} ${size === 'lg' ? styles.lg : ''}`}>
      <DropMark
        size={size === 'lg' ? 52 : 38}
        spine={onInk ? 'var(--ink)' : 'var(--paper)'}
        ink={onInk ? 'var(--paper)' : 'var(--ink)'}
      />
      <span className={styles.text}>
        <span className={styles.small}>Biblioteca</span>
        <span className={styles.name}>Gota Gota</span>
      </span>
    </Link>
  )
}
