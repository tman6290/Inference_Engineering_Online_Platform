import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { ArrowRightIcon } from './icons';
import styles from './Button.module.css';

/**
 * primary   forest pill on paper (lime in the dark theme)
 * onDark    lime pill with the nested arrow circle; dark surfaces only
 * ghost     outlined, transparent; sits on dark surfaces or paper
 * secondary raised white pill on paper
 */
export type ButtonVariant = 'primary' | 'onDark' | 'ghost' | 'secondary';

interface CommonProps {
  variant?: ButtonVariant;
  /** Stretch to the container width. */
  block?: boolean;
  /** Shows the arrow. Always on for `onDark`. */
  arrow?: boolean;
  children: ReactNode;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;
type ButtonLinkProps = CommonProps & Omit<LinkProps, 'children'>;

function classes(variant: ButtonVariant, block: boolean, extra?: string) {
  return [styles.button, styles[variant], block ? styles.block : '', extra ?? '']
    .filter(Boolean)
    .join(' ');
}

function Content({ variant, arrow, children }: CommonProps) {
  const showArrow = variant === 'onDark' || arrow;
  return (
    <>
      <span>{children}</span>
      {showArrow ? (
        <span className={variant === 'onDark' ? styles.arrowCircle : styles.arrow}>
          <ArrowRightIcon size={variant === 'onDark' ? 16 : 18} />
        </span>
      ) : null}
    </>
  );
}

export function Button({
  variant = 'primary',
  block = false,
  arrow = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={classes(variant, block, className)} {...rest}>
      <Content variant={variant} arrow={arrow}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  block = false,
  arrow = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={classes(variant, block, typeof className === 'string' ? className : undefined)}
      {...rest}
    >
      <Content variant={variant} arrow={arrow}>
        {children}
      </Content>
    </Link>
  );
}
