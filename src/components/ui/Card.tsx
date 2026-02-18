import React from 'react'
import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  hover = false
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }

  return (
    <div
      className={clsx(
        'bg-white rounded-apple shadow-apple-sm border border-gray-200',
        paddingClasses[padding],
        hover && 'hover:shadow-apple transition-shadow duration-200',
        className
      )}
    >
      {children}
    </div>
  )
}
