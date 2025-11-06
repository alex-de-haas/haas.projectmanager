"use client""use client""use client"



import { Toaster as Sonner } from "sonner"



type ToasterProps = React.ComponentProps<typeof Sonner>import { useTheme } from "next-themes"import { useTheme } from "next-themes"



const Toaster = ({ ...props }: ToasterProps) => {import { Toaster as Sonner } from "sonner"import { Toaster as Sonner } from "sonner"

  return (

    <Sonner

      className="toaster group"

      toastOptions={{type ToasterProps = React.ComponentProps<typeof Sonner>type ToasterProps = React.ComponentProps<typeof Sonner>

        classNames: {

          toast:

            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",

          description: "group-[.toast]:text-muted-foreground",const Toaster = ({ ...props }: ToasterProps) => {const Toaster = ({ ...props }: ToasterProps) => {

          actionButton:

            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",  const { theme = "system" } = useTheme()  const { theme = "system" } = useTheme()

          cancelButton:

            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",

        },

      }}  return (  return (

      {...props}

    />    <Sonner    <Sonner

  )

}      theme={theme as ToasterProps["theme"]}      theme={theme as ToasterProps["theme"]}



export { Toaster }      className="toaster group"      className="toaster group"


      toastOptions={{      toastOptions={{

        classNames: {        classNames: {

          toast:          toast:

            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",

          description: "group-[.toast]:text-muted-foreground",          description: "group-[.toast]:text-muted-foreground",

          actionButton:          actionButton:

            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",

          cancelButton:          cancelButton:

            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",

        },        },

      }}      }}

      {...props}      {...props}

    />    />

  )  )

}}



export { Toaster }export { Toaster }

